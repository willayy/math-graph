CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE id = '31fe9a92-f540-4e54-8962-0ac552193a8f'
ON CONFLICT DO NOTHING;

CREATE TABLE public.identity_verifications (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  student_card_path text NOT NULL,
  id_card_path text NOT NULL,
  status text NOT NULL DEFAULT 'checking' CHECK (status IN ('checking','needs_review','approved','rejected')),
  ai_confidence numeric,
  ai_summary text,
  ai_details jsonb,
  reviewer_id uuid REFERENCES auth.users(id),
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.identity_verifications TO authenticated;
GRANT ALL ON public.identity_verifications TO service_role;
ALTER TABLE public.identity_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own verification readable" ON public.identity_verifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins decide verifications" ON public.identity_verifications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.has_academic_email(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _uid AND u.email_confirmed_at IS NOT NULL
      AND (
        lower(split_part(u.email,'@',2)) ~ '(^|\.)(edu|edu\.[a-z]{2}|ac\.[a-z]{2}|uni-[a-z0-9-]+\.de|univ-[a-z0-9-]+\.fr)$'
        OR lower(split_part(u.email,'@',2)) ~ '(^|\.)(kth|su|uu|lu|gu|liu|umu|ki|chalmers|oru|miun|lnu|mdu|hb|his|ltu|slu|sh|kau|bth|hh|hj|hig|du)\.se$'
        OR lower(split_part(u.email,'@',2)) ~ '(^|\.)(ethz|epfl|unibas|uzh|unige|unil|unibe)\.ch$'
        OR lower(split_part(u.email,'@',2)) ~ '(^|\.)(tum|lmu|kit|rwth-aachen|tu-berlin|fu-berlin|hu-berlin|tu-dresden)\.de$'
        OR lower(split_part(u.email,'@',2)) ~ '(^|\.)(utoronto|ubc|mcgill|uwaterloo|ualberta|queensu|mcmaster|uottawa)\.ca$'
        OR lower(split_part(u.email,'@',2)) ~ '(^|\.)(uio|ntnu|uib|ku|dtu|au|sdu|aau|helsinki|aalto|tuni|utu|oulu|uva|vu|uu|leidenuniv|tudelft|tue|rug|ru|kuleuven|ugent|polimi|unimi|uniroma1|unibo|ucl|ens|sorbonne-universite|uw|uj|tcd|ucd)\.(no|dk|fi|nl|be|it|fr|pl|ie|ac\.uk)$'
        OR lower(split_part(u.email,'@',2)) ~ 'universit|(^|\.)uni\.'
      )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.has_academic_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_academic_email(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_academic(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'admin') OR (
    public.has_academic_email(_uid)
    AND EXISTS (SELECT 1 FROM public.identity_verifications v WHERE v.user_id = _uid AND v.status = 'approved')
  )
$$;

CREATE POLICY "Users upload own ID photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'id-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners and admins view ID photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'id-documents' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));