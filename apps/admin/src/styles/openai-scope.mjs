import selectorParser from "postcss-selector-parser";

/** Scope the compiled OpenAI/Tailwind entry, including its reset and tokens.
 * Component CSS modules are already local. Never apply this to legacy CSS. */
export const OPENAI_SCOPE = ':where([data-admin-ui="openai"])';
export function scopeOpenAISelector(selector) {
  return selectorParser((root) => {
    root.each((selection) => {
      let nesting = false;
      selection.walkNesting(() => {
        nesting = true;
      });
      // Native nested selectors inherit the scope from their parent rule.
      if (nesting) return;
      let directRoot = false;
      let rootInLeadingCompound = false;
      selection.walk((node) => {
        const documentTag =
          node.type === "tag" &&
          (node.value === "html" || node.value === "body");
        const documentPseudo =
          node.type === "pseudo" &&
          (node.value === ":root" || node.value === ":host");
        if (!documentTag && !documentPseudo) return;
        // Only an unconditional root in the leading compound removes the
        // need for a prefix. A root inside :is/:not must never exempt another
        // branch from isolation.
        if (
          node.parent === selection &&
          !selection.nodes
            .slice(0, selection.index(node))
            .some((part) => part.type === "combinator")
        )
          directRoot = true;
        let compound = node;
        while (compound.parent && compound.parent !== selection)
          compound = compound.parent;
        if (
          compound.parent === selection &&
          !selection.nodes
            .slice(0, selection.index(compound))
            .some((part) => part.type === "combinator")
        )
          rootInLeadingCompound = true;
        const boundary = selectorParser()
          .astSync(OPENAI_SCOPE)
          .first.first.clone();
        if (node.type === "pseudo" && node.nodes?.length) {
          const condition = node.clone();
          condition.value = ":is";
          node.replaceWith(boundary, condition);
        } else node.replaceWith(boundary);
      });
      if (directRoot) return;
      const first = selection.first;
      const themeAttribute = (node) =>
        node?.type === "attribute" && node.attribute === "data-theme";
      const themeRoot =
        themeAttribute(first) ||
        (first?.type === "pseudo" &&
          first.value === ":where" &&
          first.nodes?.length === 1 &&
          first.nodes[0].nodes.length === 1 &&
          themeAttribute(first.nodes[0].first));
      if (!themeRoot && !rootInLeadingCompound)
        selection.prepend(selectorParser.combinator({ value: " " }));
      selection.prepend(
        selectorParser().astSync(OPENAI_SCOPE).first.first.clone(),
      );
    });
  }).processSync(selector);
}
export function openaiScope() {
  return {
    postcssPlugin: "admin-openai-scope",
    OnceExit(root) {
      if (
        !root.source?.input.file
          ?.replaceAll("\\", "/")
          .endsWith("/styles/openai.css")
      )
        return;
      root.walkRules((rule) => {
        let ancestor = rule.parent;
        while (ancestor && ancestor !== root) {
          if (
            ancestor.type === "rule" ||
            (ancestor.type === "atrule" && /keyframes$/.test(ancestor.name))
          )
            return;
          ancestor = ancestor.parent;
        }
        rule.selectors = rule.selectors.map(scopeOpenAISelector);
      });
      // Tailwind's globally registered variables can otherwise change legacy
      // computed values even when every rule is scoped. SDK utilities set
      // their own values and do not need global @property registration.
      root.walkAtRules("property", (rule) => rule.remove());
    },
  };
}
openaiScope.postcss = true;
