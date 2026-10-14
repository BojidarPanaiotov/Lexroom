# Lexroom Contract Review

The application lives in [`lexroom`](lexroom/README.md). Setup, the worker, the monthly plan, and the product decisions are documented there.

Run everything from that directory:

```powershell
cd lexroom
Copy-Item .env.example .env
npm install
npm run db
npm run db:deploy
npm run db:seed
npm run dev
npm run worker
```

Open http://localhost:3000. Three lawyers share one workspace and a limit of 10 successful reviews per calendar month in Europe/Rome. The simulated reviewer uses the findings in `lexroom/samples/documents.json`.
