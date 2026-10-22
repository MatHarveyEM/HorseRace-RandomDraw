import app from './app.js';
import { DB_PATH } from './db.js';

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Melbourne Cup is running at http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
