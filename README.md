# MathGraph

Hello! I have a project, or rather a solution ot problem  in mind. Lets call it MathGraph. My issue is that during my studies of mathematics i often felt like theorems and proofs where just given to us students as random facts without any coherent "story" or overview given. I think this is quite said as actually mathematics is a very linear in nature, a problem leads to a theorem which leads to a proof which is based on axioms, you get what i mean!

My idea is to start easily with just a solid postgres db with the right entities and just a white screen that displays the entities from the db. These are the entities i have in mind initially:

Set cols: Date (can be ?), Name, Creator (can be ?), Description, Elements (many Axioms, Definitions, Theorems, Proofs, or Lemmas) Axiom cols: Date (can be ?), Name, Creator (can be ?), Statement, Definition cols: Date (can be ?), Name, Creator (can be ?), Statement, Theorem cols: Date (can be ?), Name, Creator (can be ?), Statement, Uses (many Axioms, Theorems, Lemmas, Definitions or Conjectures), Proof (many Proofs) Proof cols: Date (can be ?), Name, Creator (can be ?), Statement, For (one theorem) Lemma cols: Date (can be ?), Name, Creator (can be ?), Statement, From (one theorem).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://math-graph.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4658baa4-329e-4154-90b5-d879dd5d0e17).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
