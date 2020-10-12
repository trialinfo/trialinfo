/*
 * Copyright 2020  Andreas Gruenbacher  <andreas.gruenbacher@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License
 * for more details.
 *
 * You can find a copy of the GNU Affero General Public License at
 * <http://www.gnu.org/licenses/>.
 */

'use strict';

function compute_round() {
    let round = 1;
    let zones = [];
    return (zone, peek) => {
        if (peek)
	  return round;

	if (zones[zone - 1]) {
	    zones = [];
	    round++;
	}
	zones[zone - 1] = true;
	return round;
    }
}

module.exports = {
    compute_round: compute_round
};

/* ex:set shiftwidth=2: */
