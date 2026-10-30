import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";
import { server } from "./server";

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Screens read through SQLite WASM and ledger commands round-trip through a sync,
// which can exceed the 1 s default when the suite runs in parallel.
configure({ asyncUtilTimeout: 3000 });
