// polygon-splitter (MIT) levert geen eigen types mee.
declare module "polygon-splitter" {
  const splitPolygon: (polygon: unknown, line: unknown) => unknown;
  export default splitPolygon;
}
