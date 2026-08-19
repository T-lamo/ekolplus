// Shape of an admin coupon code — shared by the API (zod) and the Coupons
// screen (input validation). Same alphabet as a Stripe Promotion Code
// (letters, digits, dashes): the code is mirrored on Stripe verbatim so the
// person who receives it can type it on the hosted Checkout page.
export const COUPON_CODE_RE = /^[A-Z0-9-]+$/i;
export const COUPON_CODE_MIN = 3;
export const COUPON_CODE_MAX = 30;
export const COUPON_CODE_HINT = 'Lettres, chiffres et tirets uniquement (3 à 30 caractères)';
