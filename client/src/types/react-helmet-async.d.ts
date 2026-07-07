declare module "react-helmet-async" {
  import type { ReactNode } from "react";

  export function Helmet(props: { children?: ReactNode }): JSX.Element;
  export function HelmetProvider(props: { children?: ReactNode }): JSX.Element;
}
