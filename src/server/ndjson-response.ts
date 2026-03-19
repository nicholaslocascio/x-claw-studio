function isClosedStreamError(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes("Controller is already closed");
}

export function createNdjsonStreamController(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder = new TextEncoder()
): {
  write: (event: unknown) => void;
  close: () => void;
} {
  let closed = false;

  function write(event: unknown): void {
    if (closed) {
      return;
    }

    try {
      controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
    } catch (error) {
      if (isClosedStreamError(error)) {
        closed = true;
        return;
      }

      throw error;
    }
  }

  function close(): void {
    if (closed) {
      return;
    }

    closed = true;

    try {
      controller.close();
    } catch (error) {
      if (!isClosedStreamError(error)) {
        throw error;
      }
    }
  }

  return { write, close };
}
