CREATE TABLE public.sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_sets PRIMARY KEY,
  date TEXT,
  name TEXT NOT NULL,
  creator TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.axioms (
  id UUID NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_axioms PRIMARY KEY,
  date TEXT,
  name TEXT NOT NULL,
  creator TEXT,
  statement TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_definitions PRIMARY KEY,
  date TEXT,
  name TEXT NOT NULL,
  creator TEXT,
  statement TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.theorems (
  id UUID NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_theorems PRIMARY KEY,
  date TEXT,
  name TEXT NOT NULL,
  creator TEXT,
  statement TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.lemmas (
  id UUID NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_lemmas PRIMARY KEY,
  date TEXT,
  name TEXT NOT NULL,
  creator TEXT,
  statement TEXT NOT NULL,
  theorem_id UUID NOT NULL CONSTRAINT fk_lemmas_theorems REFERENCES public.theorems(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.conjectures (
  id UUID NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_conjectures PRIMARY KEY,
  date TEXT,
  name TEXT NOT NULL,
  creator TEXT,
  statement TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.proofs (
  id UUID NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_proofs PRIMARY KEY,
  date TEXT,
  name TEXT NOT NULL,
  creator TEXT,
  statement TEXT NOT NULL,
  theorem_id UUID NOT NULL CONSTRAINT fk_proofs_theorems REFERENCES public.theorems(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.theorem_uses (
  id UUID NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_theorem_uses PRIMARY KEY,
  theorem_id UUID NOT NULL CONSTRAINT fk_theorem_uses_theorems REFERENCES public.theorems(id) ON DELETE CASCADE,
  used_type TEXT NOT NULL CONSTRAINT chk_theorem_uses_type CHECK (used_type IN ('axiom','theorem','lemma','definition','conjecture')),
  used_id UUID NOT NULL,
  CONSTRAINT uq_theorem_uses UNIQUE (theorem_id, used_type, used_id)
);

CREATE TABLE public.set_elements (
  id UUID NOT NULL DEFAULT gen_random_uuid() CONSTRAINT pk_set_elements PRIMARY KEY,
  set_id UUID NOT NULL CONSTRAINT fk_set_elements_sets REFERENCES public.sets(id) ON DELETE CASCADE,
  element_type TEXT NOT NULL CONSTRAINT chk_set_elements_type CHECK (element_type IN ('axiom','definition','theorem','proof','lemma')),
  element_id UUID NOT NULL,
  CONSTRAINT uq_set_elements UNIQUE (set_id, element_type, element_id)
);

GRANT SELECT ON public.sets TO anon;
GRANT SELECT ON public.axioms TO anon;
GRANT SELECT ON public.definitions TO anon;
GRANT SELECT ON public.theorems TO anon;
GRANT SELECT ON public.lemmas TO anon;
GRANT SELECT ON public.conjectures TO anon;
GRANT SELECT ON public.proofs TO anon;
GRANT SELECT ON public.theorem_uses TO anon;
GRANT SELECT ON public.set_elements TO anon;
GRANT ALL ON public.sets TO service_role;
GRANT ALL ON public.axioms TO service_role;
GRANT ALL ON public.definitions TO service_role;
GRANT ALL ON public.theorems TO service_role;
GRANT ALL ON public.lemmas TO service_role;
GRANT ALL ON public.conjectures TO service_role;
GRANT ALL ON public.proofs TO service_role;
GRANT ALL ON public.theorem_uses TO service_role;
GRANT ALL ON public.set_elements TO service_role;

ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.axioms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theorems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lemmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conjectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theorem_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.set_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON public.sets FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON public.axioms FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON public.definitions FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON public.theorems FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON public.lemmas FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON public.conjectures FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON public.proofs FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON public.theorem_uses FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON public.set_elements FOR SELECT TO anon USING (true);

-- Starter dataset: Euclid's Elements, Book I
INSERT INTO public.axioms (date, name, creator, statement) VALUES
  ('c. 300 BCE', 'Common Notion 1', 'Euclid', 'Things which are equal to the same thing are also equal to one another.'),
  ('c. 300 BCE', 'Postulate 1', 'Euclid', 'To draw a straight line from any point to any point.'),
  ('c. 300 BCE', 'Postulate 5 (Parallel Postulate)', 'Euclid', 'If a straight line falling on two straight lines makes the interior angles on the same side less than two right angles, the two straight lines meet on that side.');

INSERT INTO public.definitions (date, name, creator, statement) VALUES
  ('c. 300 BCE', 'Point', 'Euclid', 'A point is that which has no part.'),
  ('c. 300 BCE', 'Right angle', 'Euclid', 'When a straight line standing on a straight line makes the adjacent angles equal to one another, each of the equal angles is right.');

INSERT INTO public.theorems (date, name, creator, statement) VALUES
  ('c. 300 BCE', 'Pythagorean Theorem (I.47)', 'Euclid', 'In right-angled triangles the square on the side opposite the right angle equals the sum of the squares on the sides containing the right angle.'),
  ('c. 300 BCE', 'Angle Sum of a Triangle (I.32)', 'Euclid', 'In any triangle, the three interior angles are together equal to two right angles.');

INSERT INTO public.lemmas (date, name, creator, statement, theorem_id)
SELECT 'c. 300 BCE', 'Construction of the square on a side', 'Euclid', 'On a given straight line it is possible to describe a square.', id FROM public.theorems WHERE name = 'Pythagorean Theorem (I.47)';

INSERT INTO public.conjectures (date, name, creator, statement) VALUES
  ('1742', 'Goldbach Conjecture', 'Christian Goldbach', 'Every even integer greater than 2 can be expressed as the sum of two primes.');

INSERT INTO public.proofs (date, name, creator, statement, theorem_id)
SELECT 'c. 300 BCE', 'Euclid''s windmill proof', 'Euclid', 'Drop a perpendicular from the right angle to the hypotenuse, splitting the large square into two rectangles; show each rectangle equals the square on the corresponding leg via congruent triangles.', id FROM public.theorems WHERE name = 'Pythagorean Theorem (I.47)';

INSERT INTO public.theorem_uses (theorem_id, used_type, used_id)
SELECT t.id, 'axiom', a.id FROM public.theorems t, public.axioms a WHERE t.name = 'Pythagorean Theorem (I.47)' AND a.name = 'Common Notion 1'
UNION ALL
SELECT t.id, 'definition', d.id FROM public.theorems t, public.definitions d WHERE t.name = 'Pythagorean Theorem (I.47)' AND d.name = 'Right angle'
UNION ALL
SELECT t.id, 'lemma', l.id FROM public.theorems t, public.lemmas l WHERE t.name = 'Pythagorean Theorem (I.47)' AND l.name = 'Construction of the square on a side'
UNION ALL
SELECT t.id, 'axiom', a.id FROM public.theorems t, public.axioms a WHERE t.name = 'Angle Sum of a Triangle (I.32)' AND a.name = 'Postulate 5 (Parallel Postulate)';

INSERT INTO public.sets (date, name, creator, description) VALUES
  ('c. 300 BCE', 'Euclid''s Elements, Book I', 'Euclid', 'The first book of the Elements: foundations of plane geometry, culminating in the Pythagorean theorem.');

INSERT INTO public.set_elements (set_id, element_type, element_id)
SELECT s.id, 'axiom', a.id FROM public.sets s, public.axioms a
UNION ALL
SELECT s.id, 'definition', d.id FROM public.sets s, public.definitions d
UNION ALL
SELECT s.id, 'theorem', t.id FROM public.sets s, public.theorems t
UNION ALL
SELECT s.id, 'proof', p.id FROM public.sets s, public.proofs p
UNION ALL
SELECT s.id, 'lemma', l.id FROM public.sets s, public.lemmas l;