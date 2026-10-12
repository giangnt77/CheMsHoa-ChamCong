class GoogleSheetsQuery {
  constructor(table) {
    this.table = table;
    this.operation = 'select';
    this.columns = '*';
    this.values = null;
    this.filters = [];
    this.anyFilters = [];
    this.orders = [];
    this.conflict = '';
    this.cardinality = 'many';
    this.returning = false;
    this.rowLimit = null;
  }

  select(columns = '*') {
    this.columns = columns;
    if (this.operation !== 'select') this.returning = true;
    return this;
  }

  insert(values) {
    this.operation = 'insert';
    this.values = values;
    return this;
  }

  upsert(values, options = {}) {
    this.operation = 'upsert';
    this.values = values;
    this.conflict = options.onConflict || '';
    return this;
  }

  update(values) {
    this.operation = 'update';
    this.values = values;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  }

  neq(column, value) {
    this.filters.push({ column, operator: 'neq', value });
    return this;
  }

  is(column, value) {
    this.filters.push({ column, operator: 'is', value });
    return this;
  }

  ilike(column, value) {
    this.filters.push({ column, operator: 'ilike', value });
    return this;
  }

  gte(column, value) {
    this.filters.push({ column, operator: 'gte', value });
    return this;
  }

  lte(column, value) {
    this.filters.push({ column, operator: 'lte', value });
    return this;
  }

  or(expression) {
    this.anyFilters = expression.split(',').map((part) => {
      const match = part.match(/^([^.]+)\.(eq|neq|gte|lte|ilike|is)\.(.*)$/);
      if (!match) throw new Error(`Invalid OR filter: ${part}`);
      return { column: match[1], operator: match[2], value: match[3] };
    });
    return this;
  }

  order(column, options = {}) {
    this.orders.push({
      column,
      ascending: options.ascending !== false,
      nullsFirst: options.nullsFirst,
    });
    return this;
  }

  limit(count) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('Google Sheets query limit must be a non-negative integer.');
    }
    this.rowLimit = count;
    return this;
  }

  single() {
    this.cardinality = 'one';
    return this;
  }

  maybeSingle() {
    this.cardinality = 'maybe-one';
    return this;
  }

  then(resolve, reject) {
    const request = fetch('/api/google-sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        table: this.table,
        operation: this.operation,
        columns: this.columns,
        values: this.values,
        filters: this.filters,
        anyFilters: this.anyFilters,
        orders: this.orders,
        limit: this.rowLimit,
        conflict: this.conflict,
        cardinality: this.cardinality,
        returning: this.returning,
      }),
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok && !result.error) {
        result.error = { message: 'Could not connect to Google Sheets.' };
      }
      return result;
    });

    return request.then(resolve, reject);
  }
}

export const googleSheets = {
  from(table) {
    return new GoogleSheetsQuery(table);
  },
};
