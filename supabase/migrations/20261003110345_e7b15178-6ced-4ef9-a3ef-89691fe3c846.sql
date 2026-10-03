CREATE OR REPLACE FUNCTION public.is_academic(_uid uuid)
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
GRANT EXECUTE ON FUNCTION public.is_academic(uuid) TO anon, authenticated;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(trim(full_name)) >= 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Names are public" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('axiom','definition','theorem','lemma','proof','conjecture')),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  creator text, date text, citation text,
  statement text NOT NULL CHECK (length(trim(statement)) > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','withdrawn')),
  published_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.submissions TO anon;
GRANT SELECT, INSERT, UPDATE ON public.submissions TO authenticated;
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Submissions public" ON public.submissions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Academics submit" ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND status = 'pending' AND published_id IS NULL AND public.is_academic(auth.uid()));
CREATE POLICY "Authors edit pending" ON public.submissions FOR UPDATE TO authenticated
  USING (auth.uid() = author_id AND status = 'pending')
  WITH CHECK (auth.uid() = author_id AND status IN ('pending','withdrawn') AND published_id IS NULL);

CREATE TABLE public.submission_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  relation text NOT NULL CHECK (relation IN ('uses','proof_of','lemma_of')),
  target_type text NOT NULL CHECK (target_type IN ('axiom','definition','theorem','lemma','conjecture')),
  target_id uuid NOT NULL,
  UNIQUE (submission_id, relation, target_id)
);
GRANT SELECT ON public.submission_links TO anon;
GRANT SELECT, INSERT, DELETE ON public.submission_links TO authenticated;
GRANT ALL ON public.submission_links TO service_role;
ALTER TABLE public.submission_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Links public" ON public.submission_links FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Author adds links" ON public.submission_links FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.author_id = auth.uid() AND s.status = 'pending'));
CREATE POLICY "Author removes links" ON public.submission_links FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.author_id = auth.uid() AND s.status = 'pending'));

CREATE TABLE public.submission_votes (
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approve boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, voter_id)
);
GRANT SELECT ON public.submission_votes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_votes TO authenticated;
GRANT ALL ON public.submission_votes TO service_role;
ALTER TABLE public.submission_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Votes public" ON public.submission_votes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Academics vote" ON public.submission_votes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = voter_id AND public.is_academic(auth.uid())
    AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.status = 'pending' AND s.author_id <> auth.uid()));
CREATE POLICY "Change own vote" ON public.submission_votes FOR UPDATE TO authenticated
  USING (auth.uid() = voter_id AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.status = 'pending'))
  WITH CHECK (auth.uid() = voter_id);
CREATE POLICY "Remove own vote" ON public.submission_votes FOR DELETE TO authenticated
  USING (auth.uid() = voter_id AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.status = 'pending'));

CREATE TABLE public.submission_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  suggested_statement text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.submission_comments TO anon;
GRANT SELECT, INSERT ON public.submission_comments TO authenticated;
GRANT ALL ON public.submission_comments TO service_role;
ALTER TABLE public.submission_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments public" ON public.submission_comments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Academics comment" ON public.submission_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND public.is_academic(auth.uid())
    AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = submission_id AND s.status = 'pending'));

CREATE TABLE public.change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.change_log TO anon, authenticated;
GRANT ALL ON public.change_log TO service_role;
ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "History public" ON public.change_log FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_submissions_touch BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- History logging for every table that matters
CREATE OR REPLACE FUNCTION public.log_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb := to_jsonb(COALESCE(NEW, OLD));
  act text := lower(TG_OP);
  label text;
  actor uuid := auth.uid();
BEGIN
  IF actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = actor) THEN actor := NULL; END IF;
  label := COALESCE(r->>'name', r->>'full_name', '');
  IF TG_TABLE_NAME = 'submission_votes' THEN
    label := CASE WHEN (r->>'approve')::boolean THEN 'approved' ELSE 'rejected' END || ' ' ||
      COALESCE((SELECT name FROM public.submissions WHERE id = (r->>'submission_id')::uuid), 'a submission');
  ELSIF TG_TABLE_NAME = 'submission_comments' THEN
    label := 'on ' || COALESCE((SELECT name FROM public.submissions WHERE id = (r->>'submission_id')::uuid), 'a submission')
      || CASE WHEN r->>'suggested_statement' IS NOT NULL THEN ' (suggested edit)' ELSE '' END;
  ELSIF TG_TABLE_NAME = 'submissions' AND TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    act := NEW.status;
  END IF;
  INSERT INTO public.change_log (actor_id, action, entity_type, entity_id, summary)
  VALUES (actor, act, TG_TABLE_NAME,
          CASE WHEN TG_TABLE_NAME = 'submission_votes' THEN (r->>'submission_id')::uuid ELSE (r->>'id')::uuid END,
          label);
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_change() FROM PUBLIC, anon, authenticated;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['axioms','definitions','theorems','lemmas','proofs','conjectures','sets','submissions','submission_votes','submission_comments'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_change()', t, t);
  END LOOP;
END $$;

-- Publish once 3 approvals are in
CREATE OR REPLACE FUNCTION public.publish_if_approved(_sid uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.submissions; approvals int; thm uuid; new_id uuid;
BEGIN
  SELECT * INTO s FROM public.submissions WHERE id = _sid FOR UPDATE;
  IF s IS NULL OR s.status <> 'pending' THEN RETURN COALESCE(s.status, 'missing'); END IF;
  SELECT count(*) INTO approvals FROM public.submission_votes WHERE submission_id = _sid AND approve;
  IF approvals < 3 THEN RETURN 'pending'; END IF;
  IF s.kind IN ('proof','lemma') THEN
    SELECT target_id INTO thm FROM public.submission_links
      WHERE submission_id = _sid AND relation = CASE WHEN s.kind = 'proof' THEN 'proof_of' ELSE 'lemma_of' END AND target_type = 'theorem' LIMIT 1;
    IF thm IS NULL THEN RETURN 'needs_theorem'; END IF;
  END IF;
  CASE s.kind
    WHEN 'axiom' THEN INSERT INTO public.axioms(name,creator,date,statement,citation) VALUES (s.name,s.creator,s.date,s.statement,s.citation) RETURNING id INTO new_id;
    WHEN 'definition' THEN INSERT INTO public.definitions(name,creator,date,statement,citation) VALUES (s.name,s.creator,s.date,s.statement,s.citation) RETURNING id INTO new_id;
    WHEN 'conjecture' THEN INSERT INTO public.conjectures(name,creator,date,statement,citation) VALUES (s.name,s.creator,s.date,s.statement,s.citation) RETURNING id INTO new_id;
    WHEN 'theorem' THEN
      INSERT INTO public.theorems(name,creator,date,statement,citation) VALUES (s.name,s.creator,s.date,s.statement,s.citation) RETURNING id INTO new_id;
      INSERT INTO public.theorem_uses(theorem_id, used_type, used_id)
        SELECT new_id, target_type, target_id FROM public.submission_links WHERE submission_id = _sid AND relation = 'uses';
    WHEN 'proof' THEN INSERT INTO public.proofs(name,creator,date,statement,citation,theorem_id) VALUES (s.name,s.creator,s.date,s.statement,s.citation,thm) RETURNING id INTO new_id;
    WHEN 'lemma' THEN INSERT INTO public.lemmas(name,creator,date,statement,citation,theorem_id) VALUES (s.name,s.creator,s.date,s.statement,s.citation,thm) RETURNING id INTO new_id;
  END CASE;
  UPDATE public.submissions SET status = 'published', published_id = new_id WHERE id = _sid;
  RETURN 'published';
END; $$;
REVOKE EXECUTE ON FUNCTION public.publish_if_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_if_approved(uuid) TO authenticated;