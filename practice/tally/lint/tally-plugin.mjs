const MESSAGE = 'User-facing text must come from t()/tp() in src/i18n/locales';

const TARGET_ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt']);
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const HAS_LETTER = /\p{L}/u;

function isStringLiteral(node) {
  if (!node) return false;
  if (node.type === 'Literal' && typeof node.value === 'string') return true;
  if (node.type === 'StringLiteral' && typeof node.value === 'string') return true;
  return false;
}

function getStringValue(node) {
  if (node.type === 'Literal' || node.type === 'StringLiteral') {
    return node.value;
  }
  return null;
}

export default {
  meta: {
    name: 'tally',
  },
  rules: {
    'no-literal-ui-text': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow literal text in JSX children and user-facing attributes',
        },
        messages: {
          noLiteralUiText: MESSAGE,
        },
      },
      create(context) {
        return {
          JSXText(node) {
            if (node.value && HAS_LETTER_OR_DIGIT.test(node.value)) {
              context.report({
                node,
                message: MESSAGE,
              });
            }
          },
          JSXAttribute(node) {
            const attrName = node.name?.name;
            if (!TARGET_ATTRS.has(attrName)) return;

            const val = node.value;
            if (!val) return;

            // Direct literal attribute: aria-label="Save"
            if (isStringLiteral(val)) {
              const text = getStringValue(val);
              if (text && HAS_LETTER.test(text)) {
                context.report({
                  node,
                  message: MESSAGE,
                });
              }
              return;
            }

            // Expression container literal attribute: aria-label={"Save"}
            if (val.type === 'JSXExpressionContainer' && isStringLiteral(val.expression)) {
              const text = getStringValue(val.expression);
              if (text && HAS_LETTER.test(text)) {
                context.report({
                  node,
                  message: MESSAGE,
                });
              }
            }
          },
        };
      },
    },
  },
};
