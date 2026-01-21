const server = Bun.serve({
    port: 8080,
    routes: {
        '/': () => new Response('Bun!')
    }
})
console.log(`Listening on ${server.url}`);