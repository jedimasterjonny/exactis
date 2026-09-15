// A variable the app cannot run without, read when it is needed rather
// than on import, so a build, which loads every page's modules, needs
// none of them set. A missing one fails by name, here, rather than as an
// undefined handed to whatever wanted it.
export function readEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set`);
  }
  return value;
}
