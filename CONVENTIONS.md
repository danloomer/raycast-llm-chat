# Project Code Conventions (TypeScript/React)

## Core Objective

Generate modern, idiomatic, clear, and maintainable TypeScript code following React best practices. The code should be highly readable and self-explanatory.
You must avoid code comments at all costs, your code will be self documenting.

## Formatting & Style

- **Quotes:** Use single quotes (`'`) for all TypeScript/JavaScript string literals. Use double quotes (`"`) for JSX string attributes.
- **Semicolons:** Omit semicolons at the end of statements.
- **Indentation:** Use 2 spaces for indentation.
- **Spacing:** Apply standard spacing around operators, after commas, and within code blocks.
- **Braces:** Include braces for all control flow statements (`if`, `try`/`catch`, loops), placing the opening brace on the same line.

## Naming Conventions

- **Variables & Functions:** Use `camelCase` (e.g., `isLoading`, `queryLLM`).
- **Interfaces & Types:** Use `PascalCase` (e.g., `ChatMessage`, `Preferences`).
- **Components:** Use `PascalCase` (e.g., `List.Item`, `ActionPanel`).
- **Constants:** Use `camelCase` for most constants.

## TypeScript Specifics

- **Types:** Apply TypeScript types consistently for variables, function parameters, return types, and state.
- **Interfaces:** Prefer `interface` for defining object shapes.
- **Type Specificity:** Use specific types instead of `any` whenever feasible. Reserve `any` only for truly unavoidable cases (e.g., default catch block parameters if type narrowing isn't practical).

## React/JSX Specifics

- **Components:** Implement components as functional components using hooks (`useState`, `useEffect`, `useRef`, etc.).
- **JSX Syntax:** Adhere to standard JSX syntax. Use `camelCase` for props/attributes.
- **List Keys:** Always provide a unique `key` prop when rendering lists via `.map()`.
- **Conditional Rendering:** Employ concise conditional rendering within JSX using logical AND (`&&`) or ternary operators (`? :`).

## Commenting

- **Priority:** Write self-explanatory code that minimizes the need for comments.
- **Usage:** Add comments _only_ in rare, exceptional circumstances:
  - To explain highly complex or non-obvious algorithms.
  - To document unavoidable workarounds or temporary solutions.
  - For essential `TODO` or `FIXME` markers indicating required future actions.
- **Assumption:** Assume the code reader understands standard TypeScript and React patterns.

## Imports

- **Grouping:** Group imports from the same module.
- **Organization:** Maintain a logical organization for imports (e.g., external libraries first, then internal project modules).

## Error Handling

- **Structure:** Use `try...catch...finally` blocks for operations prone to failure, especially asynchronous ones.
- **Specificity:** Handle specific error types within `catch` blocks when possible to provide targeted error responses or recovery logic.
