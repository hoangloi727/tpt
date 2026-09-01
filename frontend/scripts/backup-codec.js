"use strict";
(function () {
  async function encryptText(text, password) {
    const enc = new TextEncoder(),
      salt = crypto.getRandomValues(new Uint8Array(16)),
      iv = crypto.getRandomValues(new Uint8Array(12)),
      base = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"],
      ),
      key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"],
      ),
      data = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        enc.encode(text),
      );
    return {
      format: "TPT-ENCRYPTED-1",
      kdf: "PBKDF2-SHA256",
      iterations: 210000,
      cipher: "AES-GCM",
      salt: b64(salt),
      iv: b64(iv),
      data: b64(new Uint8Array(data)),
    };
  }
  async function decryptText(obj, password) {
    const enc = new TextEncoder(),
      base = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"],
      ),
      key = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: unb64(obj.salt),
          iterations: obj.iterations,
          hash: "SHA-256",
        },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      ),
      data = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unb64(obj.iv) },
        key,
        unb64(obj.data),
      );
    return new TextDecoder().decode(data);
  }
  const b64 = (u) => {
      let s = "";
      for (let i = 0; i < u.length; i += 32768)
        s += String.fromCharCode(...u.subarray(i, i + 32768));
      return btoa(s);
    },
    unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  const stableJSON = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableJSON).join(",")}]`;
    if (value && typeof value === "object" && !(value instanceof Blob))
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableJSON(value[key])}`)
        .join(",")}}`;
    return JSON.stringify(value);
  };
  async function sha256Text(text) {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return [...new Uint8Array(hash)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }
  async function sha256Blob(blob) {
    if (typeof Worker !== "undefined" && blob.size > 2 * 1024 * 1024) {
      const workerSource = `self.onmessage=async(event)=>{try{const hash=await crypto.subtle.digest("SHA-256",await event.data.arrayBuffer());const text=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");self.postMessage({text})}catch(error){self.postMessage({error:error.message})}}`,
        workerUrl = URL.createObjectURL(
          new Blob([workerSource], { type: "text/javascript" }),
        );
      try {
        return await new Promise((resolve, reject) => {
          const worker = new Worker(workerUrl);
          worker.onmessage = (event) => {
            worker.terminate();
            if (event.data?.error) reject(new Error(event.data.error));
            else resolve(event.data.text);
          };
          worker.onerror = (event) => {
            worker.terminate();
            reject(new Error(event.message || "Không thể băm tệp."));
          };
          worker.postMessage(blob);
        });
      } finally {
        URL.revokeObjectURL(workerUrl);
      }
    }
    const hash = await crypto.subtle.digest(
      "SHA-256",
      await blob.arrayBuffer(),
    );
    return [...new Uint8Array(hash)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }
  async function blobToBase64(
    blob,
    signal = null,
    onProgress = () => {},
  ) {
    const chunkSize = 3 * 1024 * 1024,
      chunks = [];
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      if (signal?.aborted) throw new DOMException("Đã hủy", "AbortError");
      const bytes = new Uint8Array(
          await blob.slice(offset, offset + chunkSize).arrayBuffer(),
        ),
        batchSize = 32768;
      let binary = "";
      for (let i = 0; i < bytes.length; i += batchSize)
        binary += String.fromCharCode(
          ...bytes.subarray(i, i + batchSize),
        );
      chunks.push(btoa(binary));
      onProgress(Math.min(1, (offset + bytes.length) / blob.size));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return chunks.join("");
  }
  function base64ToBlob(data, type) {
    const parts = [],
      slice = 32768;
    for (let i = 0; i < data.length; i += slice) {
      const binary = atob(data.slice(i, i + slice)),
        bytes = new Uint8Array(binary.length);
      for (let j = 0; j < binary.length; j++)
        bytes[j] = binary.charCodeAt(j);
      parts.push(bytes);
    }
    return new Blob(parts, { type: type || "application/octet-stream" });
  }

  window.TPTAppModules = window.TPTAppModules || {};
  window.TPTAppModules.backupCodec = Object.freeze({
    encryptText,
    decryptText,
    stableJSON,
    sha256Text,
    sha256Blob,
    blobToBase64,
    base64ToBlob,
  });
})();
