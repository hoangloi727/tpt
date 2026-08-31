const MAX_BODY_BYTES = 100 * 1024 * 1024;

const sendJson = (response, status, value) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
};

const readJson = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error("Request body is too large.");
        error.status = 413;
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (_) {
        const error = new Error("Invalid JSON body.");
        error.status = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });

export const createApiHandler = ({ repository, sessions }) =>
  async function handleApi(request, response, url) {
    try {
      if (request.method === "POST" && url.pathname === "/api/session") {
        const body = await readJson(request);
        const token = sessions.create(body.password);
        if (!token) return sendJson(response, 401, { error: "Mật khẩu không đúng." });
        return sendJson(response, 200, { token });
      }

      if (!sessions.verify(request.headers.authorization)) {
        return sendJson(response, 401, { error: "Phiên làm việc đã hết hạn." });
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, {
          ok: true,
          schema: repository.schema,
          previousSchema: repository.previousSchema,
        });
      }
      if (request.method === "GET" && url.pathname === "/api/export") {
        return sendJson(response, 200, repository.exportAll());
      }
      if (request.method === "POST" && url.pathname === "/api/import/replace") {
        const body = await readJson(request);
        return sendJson(response, 200, await repository.replaceAll(body.payload, body.options));
      }

      const match = url.pathname.match(/^\/api\/stores\/([^/]+)(?:\/([^/]+))?$/);
      if (!match) return sendJson(response, 404, { error: "API route not found." });
      const store = decodeURIComponent(match[1]);
      const id = match[2] ? decodeURIComponent(match[2]) : "";

      if (request.method === "GET" && !id) {
        return sendJson(
          response,
          200,
          repository.all(store, url.searchParams.get("includeDeleted") === "1"),
        );
      }
      if (request.method === "GET" && id) {
        const record = repository.get(store, id);
        return record
          ? sendJson(response, 200, record)
          : sendJson(response, 404, { error: "Record not found." });
      }
      if (request.method === "POST" && id === "bulk") {
        const body = await readJson(request);
        return sendJson(response, 200, await repository.bulkPut(store, body.rows || [], body.options));
      }
      if (request.method === "POST" && !id) {
        const body = await readJson(request);
        return sendJson(response, 200, await repository.put(store, body.row || {}, body.options));
      }
      if (request.method === "DELETE" && id) {
        return sendJson(
          response,
          200,
          await repository.remove(store, id, url.searchParams.get("hard") === "1"),
        );
      }
      if (request.method === "DELETE" && !id) {
        return sendJson(response, 200, await repository.clear(store));
      }
      return sendJson(response, 405, { error: "Method not allowed." });
    } catch (error) {
      console.error(error);
      return sendJson(response, error.status || 500, {
        error: error.status ? error.message : "Internal server error.",
        name: error.name,
      });
    }
  };
