import { jsx, jsxs } from "react/jsx-runtime";
import type { CSSProperties } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from "react-email";

import type { EmailLocale } from "../locale.ts";

export interface ActionEmailProps {
  locale: EmailLocale;
  preview: string;
  heading: string;
  body: string;
  action: string;
  url: string;
  fallback: string;
  ignore: string;
}

const styles = {
  body: { backgroundColor: "#f4f4f5", fontFamily: "Helvetica, Arial, sans-serif" },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    margin: "40px auto",
    maxWidth: "480px",
    padding: "32px",
  },
  brand: { color: "#71717a", fontSize: "14px", fontWeight: 600, margin: "0 0 24px" },
  heading: { color: "#18181b", fontSize: "22px", margin: "0 0 16px" },
  text: { color: "#3f3f46", fontSize: "15px", lineHeight: "24px", margin: "0 0 24px" },
  button: {
    backgroundColor: "#18181b",
    borderRadius: "6px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 600,
    padding: "12px 20px",
    textDecoration: "none",
  },
  fallback: {
    color: "#71717a",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "24px 0 0",
  },
  link: { color: "#18181b", wordBreak: "break-all" },
} satisfies Record<string, CSSProperties>;

export function ActionEmail(props: ActionEmailProps) {
  return jsxs(Html, {
    lang: props.locale,
    children: [
      jsx(Head, {}),
      jsx(Preview, { children: props.preview }),
      jsx(Body, {
        style: styles.body,
        children: jsxs(Container, {
          style: styles.container,
          children: [
            jsx(Text, { style: styles.brand, children: "VelaChess" }),
            jsx(Heading, { as: "h1", style: styles.heading, children: props.heading }),
            jsx(Text, { style: styles.text, children: props.body }),
            jsx(Button, {
              href: props.url,
              style: styles.button,
              children: props.action,
            }),
            jsxs(Text, {
              style: styles.fallback,
              children: [
                props.fallback,
                " ",
                jsx(Link, { href: props.url, style: styles.link, children: props.url }),
              ],
            }),
            jsx(Text, { style: styles.fallback, children: props.ignore }),
          ],
        }),
      }),
    ],
  });
}
