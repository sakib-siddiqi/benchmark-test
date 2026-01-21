package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/valyala/fasthttp"
)

func main() {
	port := 8080

	handler := func(ctx *fasthttp.RequestCtx) {
		path := string(ctx.Path())

		// Serve root route
		if path == "/" {
			ctx.SetContentType("text/plain; charset=utf-8")
			ctx.SetStatusCode(fasthttp.StatusOK)
			ctx.SetBodyString("Go!")
			return
		}

		// Serve static files from public directory
		filePath := filepath.Join("public", path)
		if _, err := os.Stat(filePath); err == nil {
			fasthttp.ServeFile(ctx, filePath)
			return
		}

		// Not found
		ctx.SetStatusCode(fasthttp.StatusNotFound)
		ctx.SetBodyString("Not found")
	}

	addr := fmt.Sprintf(":%d", port)
	fmt.Printf("Listening on http://localhost%s\n", addr)

	if err := fasthttp.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("Error in ListenAndServe: %v", err)
	}
}
