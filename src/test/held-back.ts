// A promise the test answers when it is ready, so what waits on it can
// be seen waiting: a save in flight, a deletion held. The answer is the
// promise's resolve, handed out, which Promise.withResolvers would give
// were lib past ES2023. A test gives its answer before it ends, since a
// transition left waiting on one holds every later one with it.
interface HeldBack<TValue> {
  readonly answer: (value: TValue) => void;
  readonly promise: Promise<TValue>;
}

export function heldBack<TValue>(): HeldBack<TValue> {
  let answer!: (value: TValue) => void;
  const promise = new Promise<TValue>((resolve) => {
    answer = resolve;
  });
  return { answer, promise };
}
