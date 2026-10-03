ALTER TABLE public.sets ADD COLUMN citation text;
ALTER TABLE public.axioms ADD COLUMN citation text;
ALTER TABLE public.definitions ADD COLUMN citation text;
ALTER TABLE public.theorems ADD COLUMN citation text;
ALTER TABLE public.lemmas ADD COLUMN citation text;
ALTER TABLE public.conjectures ADD COLUMN citation text;
ALTER TABLE public.proofs ADD COLUMN citation text;

UPDATE public.theorems SET citation = 'Euclid, Elements, Book I, Proposition 47' WHERE name = 'Pythagorean Theorem';
UPDATE public.theorems SET citation = 'Euclid, Elements, Book I, Proposition 32' WHERE name = 'Angle Sum of a Triangle';
UPDATE public.axioms SET citation = 'Euclid, Elements, Book I, Common Notion 1' WHERE name = 'Common Notion 1';
UPDATE public.axioms SET citation = 'Euclid, Elements, Book I, Postulate 1' WHERE name = 'Postulate 1';
UPDATE public.axioms SET citation = 'Euclid, Elements, Book I, Postulate 5' WHERE name = 'Postulate 5 (Parallel Postulate)';
UPDATE public.definitions SET citation = 'Euclid, Elements, Book I, Definition 1' WHERE name = 'Point';
UPDATE public.definitions SET citation = 'Euclid, Elements, Book I, Definition 10' WHERE name = 'Right angle';
UPDATE public.proofs SET citation = 'Euclid, Elements, Book I, Proposition 47' WHERE name LIKE '%Pythagorean%';
UPDATE public.lemmas SET citation = 'Euclid, Elements, Book I' WHERE theorem_id IN (SELECT id FROM public.theorems WHERE name = 'Pythagorean Theorem');
UPDATE public.sets SET citation = 'Euclid, Elements, Book I' WHERE name = 'Euclid''s Elements, Book I';