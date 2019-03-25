/* Knuth / Fisher-Yates shuffle algorithm */
function random_shuffle(array) {
  let shuffled = array.slice(0);

  function swap(j, k) {
    // console.log('swap(' + j + ',' + k + ')');
    if (j != k) {
      let temp = shuffled[j];
      shuffled[j] = shuffled[k];
      shuffled[k] = temp;
    }
  }

  for (let k = shuffled.length; k > 1; k--) {
    let j = Math.floor(Math.random() * k);
    swap(j, k - 1);
  }

  return shuffled;
}

module.exports = random_shuffle;
