(function () {
  function createFooter() {
    var footer = document.createElement("footer");
    footer.className = "mingyue-literary-footer";
    footer.innerHTML = [
      '<div class="mingyue-literary-footer-inner">',
      '  <section>',
      '    <div class="mingyue-literary-brand"><span class="mingyue-literary-mark">M</span><span>明月学术</span></div>',
      '    <p class="mingyue-literary-verse">纸上得来终觉浅 行而知之始见真 这里收束资料、团队与项目，也给每一次认真求索留下一点清晰的痕迹</p>',
      '  </section>',
      '  <section>',
      '    <h2 class="mingyue-literary-column-title">治学</h2>',
      '    <ul class="mingyue-literary-list"><li>博观而约取</li><li>厚积而薄发</li><li>温故而知新</li></ul>',
      '  </section>',
      '  <section>',
      '    <h2 class="mingyue-literary-column-title">同行</h2>',
      '    <ul class="mingyue-literary-list"><li>以诚相见</li><li>以事相成</li><li>以文会友</li></ul>',
      '  </section>',
      '  <section>',
      '    <h2 class="mingyue-literary-column-title">沉淀</h2>',
      '    <ul class="mingyue-literary-list"><li>资料可查</li><li>过程可循</li><li>成果可续</li></ul>',
      '  </section>',
      '</div>',
      '<div class="mingyue-literary-bottom"><span>知不足而奋进 望远山而前行</span><span>Research OS for Mingyue Academic</span></div>'
    ].join("");
    return footer;
  }

  function mount() {
    var root = document.getElementById("root");
    if (!root || document.querySelector(".mingyue-literary-footer")) return;
    document.body.appendChild(createFooter());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
