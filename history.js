import { checkState, Kwargs } from "/utils.js";

export class History {
  static _constructorKwargs = new Kwargs({
    primitives: Kwargs.required(),
    serializer: Kwargs.required(),
    deserializer: Kwargs.required(),
  });
  constructor(kwargs) {
    kwargs = History._constructorKwargs.check(kwargs);
    this._primitives = kwargs.primitives;
    this._serializer = kwargs.serializer;
    this._deserializer = kwargs.deserializer;
    this._diffs = [];
    this._latestDiffIndex = -1;
    this._isApplyingDiff = false;
    this._trackedPrimitives = new Map();
    this._newPrimitives = new Map();
    this._befores = [];

    this._primitives.beforeChange.listen(
      primitive => this._beforePrimitiveChange(primitive));
    this._primitives.afterCreation.listen(  
      primitive => this._afterPrimitiveCreation(primitive));
  }

  flush() {
    const afters = this._serializer.recordify(
      this._trackedPrimitives.values(), {
      disposed: 'skip',
    });
    this._serializer.recordify(
      this._newPrimitives.values(), {
      disposed: 'skip',
      appendTo: afters,
    });
    const diff = this._serializer.mutualDiff(this._befores, afters);
    if (diff) {
      this._diffs.length = ++this._latestDiffIndex;
      this._diffs.push(diff);
    }
    this._befores.length = 0;
    this._newPrimitives.clear();
    this._trackedPrimitives.clear();
  }

  tryUndo() {
    this._applyDiff(() =>
      this._latestDiffIndex >= 0
        ? this._diffs[this._latestDiffIndex--].backward
        : undefined);
  }

  tryRedo() {
    this._applyDiff(() =>
      this._latestDiffIndex < this._diffs.length - 1
        ? this._diffs[++this._latestDiffIndex].forward
        : undefined);
  }

  _beforePrimitiveChange(primitive) {
    if (this._isApplyingDiff) {
      return;
    }
    if (
        !this._newPrimitives.has(primitive.id) &&
        !this._trackedPrimitives.hasOrSet(primitive.id, primitive)) {
      this._befores.push(this._serializer.recordify(primitive));
    }
  }

  _afterPrimitiveCreation(primitive) {
    if (this._isApplyingDiff) {
      return;
    }
    checkState(!this._trackedPrimitives.has(primitive.id),
      `A primitive id=${primitive.id} declared as changed is now being ` +
      `declared as new.`);
    this._newPrimitives.set(primitive.id, primitive);
  }

  _applyDiff(recordsSupplier) {
    checkState(!this._isApplyingDiff, "Nested call to `_applyDiff`.");
    checkState(
      this._newPrimitives.size == 0 && this._trackedPrimitives.size == 0,
      "Cannot `_applyDiff` while there are pending changes.");
    this._isApplyingDiff = true;
    try {
      const records = recordsSupplier();
      if (records) {
        this._deserializer.derecordify(records, {
          into: this._primitives,
          diff: true,
        });
      }
    } finally {
      this._isApplyingDiff = false;
    }
  }

  _checkNotApplyingDiff() {
    checkState(!this._isApplyingDiff)
  }
}