import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    /**
     * GLO-03: accessibility rules that fail the build.
     *
     * `next/core-web-vitals` enables a handful of jsx-a11y rules; this turns on the full
     * recommended set. It runs in the existing `npm run lint` step, which CI already gates
     * on — the point is that today's good labelling cannot silently regress in a refactor.
     *
     * The plugin is registered by eslint-config-next, so only its RULES are spread here.
     * Re-registering it is a hard config error.
     */
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,

      /**
       * The UI kit associates a label with its control by nesting rather than `htmlFor`,
       * which is valid HTML and correctly exposed — but the rule cannot see through a custom
       * component to know that `<Checkbox>` is a control. Naming them keeps the rule useful
       * rather than noisy, which is the difference between a gate people fix and one they
       * turn off.
       */
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          controlComponents: ["Checkbox", "Input", "Textarea", "Select", "Switch", "RadioGroup"],
          depth: 3,
        },
      ],

      /**
       * KNOWN EXCEPTION, and a real one rather than a lint convenience.
       *
       * Every `<video>` on the platform plays media a user uploaded — teacher intro videos
       * and credential evidence. Captions cannot be synthesised at render time, and requiring
       * a WebVTT file before publishing would block the core product on a feature nobody has
       * built. Closing it needs a transcription pipeline, which is its own piece of work.
       *
       * Narrower than it was: removing the courses product took paid lesson video with it, so
       * the remaining surface is a teacher's own short intro clip rather than the substance
       * of what a student paid for. Worth revisiting on that basis — /accessibility still
       * discloses it as an exception.
       *
       * Turned off here rather than silenced at six call sites, so there is one place that
       * says why — and it is disclosed at /accessibility rather than left for a user to
       * discover.
       */
      "jsx-a11y/media-has-caption": "off",
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/coverage/**",
    "**/next-env.d.ts",
    ".claude/**",
  ]),
]);

export default eslintConfig;
