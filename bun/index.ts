const server = Bun.serve({
    port: 8080,
    async fetch(req) {
        const url = new URL(req.url);

        // Serve root route
        if (url.pathname === '/') {
            return new Response('Bun!');
        }

        // Serve static files from public directory (without /public prefix)
        const filePath = './public' + url.pathname;
        const file = Bun.file(filePath);

        if (await file.exists()) {
            return new Response(file);
        }

        return new Response('Not found', { status: 404 });
    }
})
console.log(`Listening on ${server.url}`);