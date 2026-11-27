// Imports de arquivos que o Metro resolve (CSS nos componentes DOM; fontes como asset).
declare module "*.css";
declare module "*.ttf" {
  const asset: number | string | { uri: string };
  export default asset;
}
