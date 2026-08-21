/**
 * Set-of-Marks overlay (perception ladder K4). Draws numbered boxes over the
 * interactive elements already tagged with data-ba-i, so the vision model
 * returns a NUMBER, not raw coordinates. Coordinates are only used at K5.
 * Credit: Set-of-Mark prompting; box style follows nanobrowser's highlighter.
 */

/** () => void — draw labeled boxes over tagged elements into an overlay layer. */
export const PAGE_DRAW_SOM_FN = `(() => {
  var prev = document.getElementById("__ba_som__");
  if (prev) prev.remove();
  var layer = document.createElement("div");
  layer.id = "__ba_som__";
  layer.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  var palette = ["#e6194B","#3cb44b","#4363d8","#f58231","#911eb4","#42d4f4","#f032e6","#bfef45"];
  var tagged = document.querySelectorAll("[data-ba-i]");
  for (var k = 0; k < tagged.length; k++) {
    var el = tagged[k];
    var i = el.getAttribute("data-ba-i");
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    var color = palette[(parseInt(i, 10) - 1) % palette.length];
    var box = document.createElement("div");
    box.style.cssText = "position:absolute;left:" + r.left + "px;top:" + r.top +
      "px;width:" + r.width + "px;height:" + r.height +
      "px;border:2px solid " + color + ";box-sizing:border-box;";
    var label = document.createElement("div");
    label.textContent = i;
    label.style.cssText = "position:absolute;left:" + Math.max(0, r.left) + "px;top:" +
      Math.max(0, r.top - 14) + "px;background:" + color +
      ";color:#fff;font:bold 11px monospace;padding:0 3px;border-radius:2px;";
    layer.appendChild(box);
    layer.appendChild(label);
  }
  document.body.appendChild(layer);
})`;

/** () => void — remove the overlay before continuing. */
export const PAGE_CLEAR_SOM_FN = `(() => {
  var el = document.getElementById("__ba_som__");
  if (el) el.remove();
})`;
