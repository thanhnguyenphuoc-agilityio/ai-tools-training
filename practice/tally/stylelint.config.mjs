export default {
  extends: ['stylelint-config-standard-scss'],
  rules: {
    // Project convention: enforce BEM class naming.
    'selector-class-pattern': [
      '^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$',
      {
        message: 'Expected class selector to match BEM pattern',
      },
    ],
    // Project convention: colors only via CSS custom properties.
    'color-no-hex': true,
    'color-named': 'never',

    // Prettier controls blank lines around variables and comments.
    'scss/dollar-variable-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'scss/double-slash-comment-empty-line-before': null,

    // Font names like Roboto and Consolas use standard title capitalization.
    'value-keyword-case': null,

    // Standard cross-browser mobile reset requires vendor prefix.
    'property-no-vendor-prefix': null,

    // Legacy clip property retained alongside modern clip-path for older screen readers.
    'property-no-deprecated': null,

    // 6-digit hex format is consistent across theme definitions.
    'color-hex-length': null,

    // Decimal alpha values (e.g. 0.45) preferred in rgb() declarations.
    'alpha-value-notation': null,
  },
  overrides: [
    {
      // Theme palette file is the only location where raw colors are defined.
      files: ['**/_themes.scss'],
      rules: {
        'color-no-hex': null,
        'color-named': null,
      },
    },
  ],
};
