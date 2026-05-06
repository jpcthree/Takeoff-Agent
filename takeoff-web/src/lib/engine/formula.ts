/**
 * Safe formula evaluator for trade-module scope items.
 *
 * Why hand-rolled: `eval` is unsafe; `Function` is unsafe; mathjs is overkill.
 * We need a tiny, deterministic, sandboxed evaluator that supports:
 *   - numeric and string literals
 *   - identifiers (looked up in a variable scope)
 *   - arithmetic: + - * / %
 *   - comparisons: == != < <= > >=
 *   - logical: && || !
 *   - parentheses
 *   - function calls (whitelisted: ceil, floor, round, max, min, sqrt,
 *                     abs, lookup, eq, has)
 *   - ternary: cond ? a : b
 *
 * Anything outside this surface area throws.
 */

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

type TokenType =
  | 'NUMBER' | 'STRING' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN'
  | 'COMMA' | 'QUESTION' | 'COLON' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const OP_CHARS = new Set(['+', '-', '*', '/', '%', '=', '!', '<', '>', '&', '|']);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = src.length;

  while (i < len) {
    const c = src[i];

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    // Numbers (no leading sign — that's a unary op handled in parser)
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      let j = i;
      while (j < len && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      tokens.push({ type: 'NUMBER', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // String literals
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < len && src[j] !== quote) {
        if (src[j] === '\\') j++;
        j++;
      }
      if (j >= len) throw new Error(`Unterminated string at ${i}`);
      tokens.push({ type: 'STRING', value: src.slice(i + 1, j), pos: i });
      i = j + 1;
      continue;
    }

    // Identifiers (incl. keywords like true/false/null)
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let j = i;
      while (j < len && ((src[j] >= 'a' && src[j] <= 'z') || (src[j] >= 'A' && src[j] <= 'Z') || (src[j] >= '0' && src[j] <= '9') || src[j] === '_')) j++;
      tokens.push({ type: 'IDENT', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    if (c === '(') { tokens.push({ type: 'LPAREN', value: '(', pos: i }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'RPAREN', value: ')', pos: i }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'COMMA', value: ',', pos: i }); i++; continue; }
    if (c === '?') { tokens.push({ type: 'QUESTION', value: '?', pos: i }); i++; continue; }
    if (c === ':') { tokens.push({ type: 'COLON', value: ':', pos: i }); i++; continue; }

    // Multi-char operators
    if (OP_CHARS.has(c)) {
      let j = i + 1;
      while (j < len && OP_CHARS.has(src[j])) j++;
      tokens.push({ type: 'OP', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    throw new Error(`Unexpected character '${c}' at ${i}`);
  }

  tokens.push({ type: 'EOF', value: '', pos: len });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser → AST
// ---------------------------------------------------------------------------

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'ident'; name: string }
  | { kind: 'unary'; op: string; expr: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'tern'; cond: Node; t: Node; f: Node }
  | { kind: 'call'; name: string; args: Node[] };

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(src: string) {
    this.tokens = tokenize(src);
  }

  parse(): Node {
    const n = this.parseTernary();
    if (this.peek().type !== 'EOF') {
      throw new Error(`Unexpected token '${this.peek().value}' at ${this.peek().pos}`);
    }
    return n;
  }

  private peek(off = 0): Token { return this.tokens[this.pos + off]; }
  private next(): Token { return this.tokens[this.pos++]; }

  private parseTernary(): Node {
    const cond = this.parseOr();
    if (this.peek().type === 'QUESTION') {
      this.next();
      const t = this.parseTernary();
      if (this.peek().type !== 'COLON') throw new Error("Expected ':' in ternary");
      this.next();
      const f = this.parseTernary();
      return { kind: 'tern', cond, t, f };
    }
    return cond;
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.peek().type === 'OP' && this.peek().value === '||') {
      this.next();
      left = { kind: 'binary', op: '||', left, right: this.parseAnd() };
    }
    return left;
  }
  private parseAnd(): Node {
    let left = this.parseEquality();
    while (this.peek().type === 'OP' && this.peek().value === '&&') {
      this.next();
      left = { kind: 'binary', op: '&&', left, right: this.parseEquality() };
    }
    return left;
  }
  private parseEquality(): Node {
    let left = this.parseComparison();
    while (this.peek().type === 'OP' && (this.peek().value === '==' || this.peek().value === '!=')) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.parseComparison() };
    }
    return left;
  }
  private parseComparison(): Node {
    let left = this.parseAdd();
    while (this.peek().type === 'OP' && ['<', '<=', '>', '>='].includes(this.peek().value)) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.parseAdd() };
    }
    return left;
  }
  private parseAdd(): Node {
    let left = this.parseMul();
    while (this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.parseMul() };
    }
    return left;
  }
  private parseMul(): Node {
    let left = this.parseUnary();
    while (this.peek().type === 'OP' && (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.parseUnary() };
    }
    return left;
  }
  private parseUnary(): Node {
    if (this.peek().type === 'OP' && (this.peek().value === '-' || this.peek().value === '+' || this.peek().value === '!')) {
      const op = this.next().value;
      return { kind: 'unary', op, expr: this.parseUnary() };
    }
    return this.parsePrimary();
  }
  private parsePrimary(): Node {
    const t = this.next();
    if (t.type === 'NUMBER') return { kind: 'num', value: parseFloat(t.value) };
    if (t.type === 'STRING') return { kind: 'str', value: t.value };
    if (t.type === 'LPAREN') {
      const n = this.parseTernary();
      if (this.peek().type !== 'RPAREN') throw new Error("Expected ')'");
      this.next();
      return n;
    }
    if (t.type === 'IDENT') {
      if (t.value === 'true') return { kind: 'bool', value: true };
      if (t.value === 'false') return { kind: 'bool', value: false };
      if (t.value === 'null') return { kind: 'null' };
      // Function call?
      if (this.peek().type === 'LPAREN') {
        this.next();
        const args: Node[] = [];
        if (this.peek().type !== 'RPAREN') {
          args.push(this.parseTernary());
          while (this.peek().type === 'COMMA') {
            this.next();
            args.push(this.parseTernary());
          }
        }
        if (this.peek().type !== 'RPAREN') throw new Error("Expected ')' after args");
        this.next();
        return { kind: 'call', name: t.value, args };
      }
      return { kind: 'ident', name: t.value };
    }
    throw new Error(`Unexpected token '${t.value}' at ${t.pos}`);
  }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export type FormulaValue = number | string | boolean | null;
export type FormulaScope = Record<string, FormulaValue>;

type FormulaFn = (...args: FormulaValue[]) => FormulaValue;

function asNumber(v: FormulaValue, where: string): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === undefined) return 0;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  throw new Error(`${where}: expected number, got ${typeof v} (${String(v)})`);
}

const BUILTINS: Record<string, FormulaFn> = {
  ceil: (x) => Math.ceil(asNumber(x, 'ceil')),
  floor: (x) => Math.floor(asNumber(x, 'floor')),
  round: (x, places) => {
    const p = places === undefined ? 0 : asNumber(places, 'round');
    const m = Math.pow(10, p);
    return Math.round(asNumber(x, 'round') * m) / m;
  },
  max: (...args) => {
    if (args.length === 0) return 0;
    return args.reduce<number>((acc, v) => Math.max(acc, asNumber(v, 'max')), -Infinity);
  },
  min: (...args) => {
    if (args.length === 0) return 0;
    return args.reduce<number>((acc, v) => Math.min(acc, asNumber(v, 'min')), Infinity);
  },
  sqrt: (x) => Math.sqrt(asNumber(x, 'sqrt')),
  abs: (x) => Math.abs(asNumber(x, 'abs')),
  /** eq(a, b) — strict equality. Useful in boolean position. */
  eq: (a, b) => a === b,
  /** has(x) — true iff x is non-null/undefined and not 0/empty. */
  has: (x) => x !== null && x !== undefined && x !== '' && x !== 0 && x !== false,
};

/**
 * Evaluate a parsed AST against a variable scope.
 */
function evalNode(node: Node, scope: FormulaScope): FormulaValue {
  switch (node.kind) {
    case 'num': return node.value;
    case 'str': return node.value;
    case 'bool': return node.value;
    case 'null': return null;

    case 'ident': {
      if (!(node.name in scope)) {
        // Treat missing identifiers as 0 — keeps formulas resilient to optional vars
        return 0;
      }
      return scope[node.name];
    }

    case 'unary': {
      const v = evalNode(node.expr, scope);
      if (node.op === '-') return -asNumber(v, 'unary -');
      if (node.op === '+') return asNumber(v, 'unary +');
      if (node.op === '!') return !truthy(v);
      throw new Error(`Unknown unary op '${node.op}'`);
    }

    case 'binary': {
      // Short-circuit logical ops
      if (node.op === '&&') {
        const l = evalNode(node.left, scope);
        if (!truthy(l)) return l;
        return evalNode(node.right, scope);
      }
      if (node.op === '||') {
        const l = evalNode(node.left, scope);
        if (truthy(l)) return l;
        return evalNode(node.right, scope);
      }
      const l = evalNode(node.left, scope);
      const r = evalNode(node.right, scope);
      switch (node.op) {
        case '+': {
          // Allow string concatenation when either side is a string
          if (typeof l === 'string' || typeof r === 'string') {
            return String(l ?? '') + String(r ?? '');
          }
          return asNumber(l, '+') + asNumber(r, '+');
        }
        case '-': return asNumber(l, '-') - asNumber(r, '-');
        case '*': return asNumber(l, '*') * asNumber(r, '*');
        case '/': {
          const d = asNumber(r, '/');
          if (d === 0) return 0;
          return asNumber(l, '/') / d;
        }
        case '%': {
          const d = asNumber(r, '%');
          if (d === 0) return 0;
          return asNumber(l, '%') % d;
        }
        case '==': return l === r;
        case '!=': return l !== r;
        case '<': return asNumber(l, '<') < asNumber(r, '<');
        case '<=': return asNumber(l, '<=') <= asNumber(r, '<=');
        case '>': return asNumber(l, '>') > asNumber(r, '>');
        case '>=': return asNumber(l, '>=') >= asNumber(r, '>=');
      }
      throw new Error(`Unknown binary op '${node.op}'`);
    }

    case 'tern':
      return truthy(evalNode(node.cond, scope))
        ? evalNode(node.t, scope)
        : evalNode(node.f, scope);

    case 'call': {
      const fn = BUILTINS[node.name];
      if (!fn) throw new Error(`Unknown function '${node.name}'`);
      const args = node.args.map((a) => evalNode(a, scope));
      return fn(...args);
    }
  }
}

function truthy(v: FormulaValue): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  return Boolean(v);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const PARSE_CACHE = new Map<string, Node>();

function parse(src: string): Node {
  const cached = PARSE_CACHE.get(src);
  if (cached) return cached;
  const ast = new Parser(src).parse();
  PARSE_CACHE.set(src, ast);
  return ast;
}

/**
 * Evaluate a formula string against a variable scope.
 * Returns the result or throws on parse / evaluation error.
 */
export function evalFormula(src: string, scope: FormulaScope): FormulaValue {
  return evalNode(parse(src), scope);
}

/**
 * Evaluate a formula expecting a number. Coerces booleans (true→1, false→0)
 * and parsable strings; throws if the result can't be a number.
 */
export function evalNumber(src: string, scope: FormulaScope): number {
  return asNumber(evalFormula(src, scope), `formula '${src}'`);
}

/** Evaluate a boolean predicate (returns truthy/falsy of the result). */
export function evalBool(src: string, scope: FormulaScope): boolean {
  return truthy(evalFormula(src, scope));
}

/**
 * Substitute {var} placeholders in a template string from the scope.
 * Used for scope-item descriptions like "Wall Insulation - R-{r_value}".
 * Missing vars render as empty strings.
 */
export function renderTemplate(template: string, scope: FormulaScope): string {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, name) => {
    const v = scope[name];
    if (v === null || v === undefined) return '';
    return String(v);
  });
}
