CREATE OR REPLACE FUNCTION public.log_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  ELSIF TG_TABLE_NAME = 'submissions' AND TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW)->>'status' IS DISTINCT FROM to_jsonb(OLD)->>'status' THEN act := to_jsonb(NEW)->>'status'; END IF;
  END IF;
  INSERT INTO public.change_log (actor_id, action, entity_type, entity_id, summary)
  VALUES (actor, act, TG_TABLE_NAME,
          CASE WHEN TG_TABLE_NAME = 'submission_votes' THEN (r->>'submission_id')::uuid ELSE (r->>'id')::uuid END,
          label);
  RETURN COALESCE(NEW, OLD);
END; $function$;
REVOKE EXECUTE ON FUNCTION public.log_change() FROM PUBLIC, anon, authenticated;

INSERT INTO public.theorems (id, date, name, creator, statement, created_at, citation)
SELECT id, date, name, creator, statement, created_at, citation FROM public.lemmas;

INSERT INTO public.theorem_uses (theorem_id, used_type, used_id)
SELECT l.theorem_id, 'theorem', l.id FROM public.lemmas l
WHERE NOT EXISTS (SELECT 1 FROM public.theorem_uses u WHERE u.theorem_id = l.theorem_id AND u.used_id = l.id);

DELETE FROM public.theorem_uses u WHERE u.used_type = 'lemma' AND EXISTS (
  SELECT 1 FROM public.theorem_uses v WHERE v.theorem_id = u.theorem_id AND v.used_id = u.used_id AND v.used_type = 'theorem');
UPDATE public.theorem_uses SET used_type = 'theorem' WHERE used_type = 'lemma';
DELETE FROM public.theorem_uses WHERE theorem_id = used_id;
UPDATE public.set_elements SET element_type = 'theorem' WHERE element_type = 'lemma';

ALTER TABLE public.theorem_uses DROP CONSTRAINT chk_theorem_uses_type;
ALTER TABLE public.theorem_uses ADD CONSTRAINT chk_theorem_uses_type CHECK (used_type IN ('axiom','theorem','definition','conjecture'));
ALTER TABLE public.set_elements DROP CONSTRAINT chk_set_elements_type;
ALTER TABLE public.set_elements ADD CONSTRAINT chk_set_elements_type CHECK (element_type IN ('axiom','definition','theorem','proof','conjecture'));

DELETE FROM public.submission_links WHERE relation = 'lemma_of';
UPDATE public.submission_links SET target_type = 'theorem' WHERE target_type = 'lemma';
UPDATE public.submissions SET kind = 'theorem' WHERE kind = 'lemma';
ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_kind_check;
ALTER TABLE public.submissions ADD CONSTRAINT submissions_kind_check CHECK (kind IN ('axiom','definition','theorem','proof','conjecture'));
ALTER TABLE public.submission_links DROP CONSTRAINT IF EXISTS submission_links_relation_check;
ALTER TABLE public.submission_links ADD CONSTRAINT submission_links_relation_check CHECK (relation IN ('uses','proof_of'));
ALTER TABLE public.submission_links DROP CONSTRAINT IF EXISTS submission_links_target_type_check;
ALTER TABLE public.submission_links ADD CONSTRAINT submission_links_target_type_check CHECK (target_type IN ('axiom','definition','theorem','conjecture'));

DROP TABLE public.lemmas;

CREATE OR REPLACE FUNCTION public.publish_if_approved(_sid uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.submissions; approvals int; thm uuid; new_id uuid;
BEGIN
  SELECT * INTO s FROM public.submissions WHERE id = _sid FOR UPDATE;
  IF s IS NULL OR s.status <> 'pending' THEN RETURN COALESCE(s.status, 'missing'); END IF;
  SELECT count(*) INTO approvals FROM public.submission_votes WHERE submission_id = _sid AND approve;
  IF approvals < 3 THEN RETURN 'pending'; END IF;
  IF s.kind = 'proof' THEN
    SELECT target_id INTO thm FROM public.submission_links
      WHERE submission_id = _sid AND relation = 'proof_of' AND target_type = 'theorem' LIMIT 1;
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
  END CASE;
  UPDATE public.submissions SET status = 'published', published_id = new_id WHERE id = _sid;
  RETURN 'published';
END; $$;
REVOKE EXECUTE ON FUNCTION public.publish_if_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_if_approved(uuid) TO authenticated;