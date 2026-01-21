import express from 'express';
import path from 'path';

const app = express();
const port = 8080;

// Serve static files from public directory (without /public prefix)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
    res.send('Bun!');
});

app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
});
