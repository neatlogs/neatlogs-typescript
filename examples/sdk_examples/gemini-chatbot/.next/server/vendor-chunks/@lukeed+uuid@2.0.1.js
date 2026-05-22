"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/@lukeed+uuid@2.0.1";
exports.ids = ["vendor-chunks/@lukeed+uuid@2.0.1"];
exports.modules = {

/***/ "(instrument)/./node_modules/.pnpm/@lukeed+uuid@2.0.1/node_modules/@lukeed/uuid/dist/index.mjs":
/*!****************************************************************************************!*\
  !*** ./node_modules/.pnpm/@lukeed+uuid@2.0.1/node_modules/@lukeed/uuid/dist/index.mjs ***!
  \****************************************************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   v4: () => (/* binding */ v4)\n/* harmony export */ });\nvar IDX=256, HEX=[], BUFFER;\nwhile (IDX--) HEX[IDX] = (IDX + 256).toString(16).substring(1);\n\nfunction v4() {\n\tvar i=0, num, out='';\n\n\tif (!BUFFER || ((IDX + 16) > 256)) {\n\t\tBUFFER = Array(i=256);\n\t\twhile (i--) BUFFER[i] = 256 * Math.random() | 0;\n\t\ti = IDX = 0;\n\t}\n\n\tfor (; i < 16; i++) {\n\t\tnum = BUFFER[IDX + i];\n\t\tif (i==6) out += HEX[num & 15 | 64];\n\t\telse if (i==8) out += HEX[num & 63 | 128];\n\t\telse out += HEX[num];\n\n\t\tif (i & 1 && i > 1 && i < 11) out += '-';\n\t}\n\n\tIDX++;\n\treturn out;\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vbm9kZV9tb2R1bGVzLy5wbnBtL0BsdWtlZWQrdXVpZEAyLjAuMS9ub2RlX21vZHVsZXMvQGx1a2VlZC91dWlkL2Rpc3QvaW5kZXgubWpzIiwibWFwcGluZ3MiOiI7Ozs7QUFBQTtBQUNBOztBQUVPO0FBQ1A7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxRQUFRLFFBQVE7QUFDaEI7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0EiLCJzb3VyY2VzIjpbIi9Vc2Vycy90YW5pc2hhYmFuaWsvUHJvamVjdHMvbmVhdGxvZ3MtdHlwZXNjcmlwdC9leGFtcGxlcy9zZGtfZXhhbXBsZXMvZ2VtaW5pLWNoYXRib3Qvbm9kZV9tb2R1bGVzLy5wbnBtL0BsdWtlZWQrdXVpZEAyLjAuMS9ub2RlX21vZHVsZXMvQGx1a2VlZC91dWlkL2Rpc3QvaW5kZXgubWpzIl0sInNvdXJjZXNDb250ZW50IjpbInZhciBJRFg9MjU2LCBIRVg9W10sIEJVRkZFUjtcbndoaWxlIChJRFgtLSkgSEVYW0lEWF0gPSAoSURYICsgMjU2KS50b1N0cmluZygxNikuc3Vic3RyaW5nKDEpO1xuXG5leHBvcnQgZnVuY3Rpb24gdjQoKSB7XG5cdHZhciBpPTAsIG51bSwgb3V0PScnO1xuXG5cdGlmICghQlVGRkVSIHx8ICgoSURYICsgMTYpID4gMjU2KSkge1xuXHRcdEJVRkZFUiA9IEFycmF5KGk9MjU2KTtcblx0XHR3aGlsZSAoaS0tKSBCVUZGRVJbaV0gPSAyNTYgKiBNYXRoLnJhbmRvbSgpIHwgMDtcblx0XHRpID0gSURYID0gMDtcblx0fVxuXG5cdGZvciAoOyBpIDwgMTY7IGkrKykge1xuXHRcdG51bSA9IEJVRkZFUltJRFggKyBpXTtcblx0XHRpZiAoaT09Nikgb3V0ICs9IEhFWFtudW0gJiAxNSB8IDY0XTtcblx0XHRlbHNlIGlmIChpPT04KSBvdXQgKz0gSEVYW251bSAmIDYzIHwgMTI4XTtcblx0XHRlbHNlIG91dCArPSBIRVhbbnVtXTtcblxuXHRcdGlmIChpICYgMSAmJiBpID4gMSAmJiBpIDwgMTEpIG91dCArPSAnLSc7XG5cdH1cblxuXHRJRFgrKztcblx0cmV0dXJuIG91dDtcbn1cbiJdLCJuYW1lcyI6W10sImlnbm9yZUxpc3QiOlswXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(instrument)/./node_modules/.pnpm/@lukeed+uuid@2.0.1/node_modules/@lukeed/uuid/dist/index.mjs\n");

/***/ })

};
;