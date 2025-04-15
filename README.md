# shadcn-unocss-cli

[![npm version](https://badgen.net/npm/v/shadcn-uno)](https://npm.im/shadcn-uno) [![npm downloads](https://badgen.net/npm/dm/my-ts-lib)](https://npm.im/shadcn-uno)

## usage

```bash
pnpm dlx shadcn-uno
```

## motivation

If you are using shadcn/ui, you may want to use unocss to style your components.

But when you install the components, you also need to install the deps of the components.

So this tool is to help you to install the deps of the components.


## TODO

- [x] read `components.json` from user project root, or use cli to generate
- [x] check `uno.config.ts` file exsit
- [x] support pnpm add icon deps, `clsx`, `tailwind-merge`, `lucide-react`, `unocss-preset-animations`, `unocss-preset-shadcn`
