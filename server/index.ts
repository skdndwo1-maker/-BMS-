import "./load-env.js";
import { app } from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);

app.listen(PORT, () => {
  console.error(`[guideline-api] http://localhost:${PORT}`);
});
