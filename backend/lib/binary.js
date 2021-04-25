function binary_insert(array, elem, compare) {
  if (!compare)
    compare = (a, b) => a - b;

  let i = 0, j = array.length - 1;
  while (i <= j) {
    let k = (i + j) >> 1;
    let cmp = compare(array[k], elem);
    if (cmp <= 0)
      i = k + 1;
    else if (cmp > 0)
      j = k - 1;
  }
  array.splice(i, 0, elem);
  return array;
}

module.exports = {
  insert: binary_insert
};
