// SQL adapter: alternative providers implement prepared first/all/run/batch operations.
export class Store {
  constructor(db){this.db=db;}
  first(sql,...args){return this.db.prepare(sql).bind(...args).first();}
  async all(sql,...args){return (await this.db.prepare(sql).bind(...args).all()).results;}
  run(sql,...args){return this.db.prepare(sql).bind(...args).run();}
  batch(queries){return this.db.batch(queries.map(([sql,...args])=>this.db.prepare(sql).bind(...args)));}
}
