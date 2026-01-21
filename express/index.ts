import express from 'express';
import path from 'path';

const app = express();
const port = 8080;

// Serve static files from public directory (without /public prefix)
// When compiled, __dirname points to dist/, so we need to go up one level
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

app.get('/', (_req, res) => {
    res.send('Express!');
});

app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
});
