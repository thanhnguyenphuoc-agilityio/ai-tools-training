const MESSAGE = 'User-facing text must come from t()/tp() in src/i18n/locales';

const TARGET_ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt']);
// Letters, digits and symbols alike: a hard-coded separator or arrow is UI text too.
// Only pure whitespace is layout.
const HAS_VISIBLE_TEXT = /\S/u;

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

function unwrap(node) {
  let curr = node;
  while (
    curr &&
    (curr.type === 'TSAsExpression' ||
      curr.type === 'TSSatisfiesExpression' ||
      curr.type === 'TSTypeAssertion' ||
      curr.type === 'TSNonNullExpression' ||
      curr.type === 'ParenthesizedExpression')
  ) {
    curr = curr.expression;
  }
  return curr;
}

function checkExpression(node, context) {
  if (!node) return;
  const expr = unwrap(node);
  if (!expr) return;

  if (isStringLiteral(expr)) {
    const text = getStringValue(expr);
    if (text && HAS_VISIBLE_TEXT.test(text)) {
      context.report({
        node: expr,
        message: MESSAGE,
      });
    }
    return;
  }

  if (expr.type === 'TemplateLiteral') {
    const hasText = expr.quasis?.some((q) => {
      const text = q?.value?.cooked ?? q?.value?.raw ?? '';
      return HAS_VISIBLE_TEXT.test(text);
    });
    if (hasText) {
      context.report({
        node: expr,
        message: MESSAGE,
      });
    }
    return;
  }

  if (expr.type === 'ConditionalExpression') {
    checkExpression(expr.consequent, context);
    checkExpression(expr.alternate, context);
    return;
  }

  if (expr.type === 'LogicalExpression') {
    checkExpression(expr.right, context);
  }
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
            if (node.value && HAS_VISIBLE_TEXT.test(node.value)) {
              context.report({
                node,
                message: MESSAGE,
              });
            }
          },
          JSXExpressionContainer(node) {
            const parentType = node.parent?.type;
            if (parentType === 'JSXElement' || parentType === 'JSXFragment') {
              checkExpression(node.expression, context);
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
              if (text && HAS_VISIBLE_TEXT.test(text)) {
                context.report({
                  node,
                  message: MESSAGE,
                });
              }
              return;
            }

            // Expression container literal or expression attribute: aria-label={"Save"}, aria-label={`Close`}
            if (val.type === 'JSXExpressionContainer') {
              checkExpression(val.expression, context);
            }
          },
        };
      },
    },
  },
};
