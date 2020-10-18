const ctx = '@@InfiniteScroll';

var throttle = function(fn, delay) {
  var now, lastExec, timer, context, args; //eslint-disable-line

  var execute = function() {
    fn.apply(context, args);
    lastExec = now;
  };

  return function() {
    context = this;
    args = arguments;

    now = Date.now();

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (lastExec) {
      var diff = delay - (now - lastExec);
      if (diff < 0) {
        execute();
      } else {
        timer = setTimeout(() => {
          execute();
        }, diff);
      }
    } else {
      execute();
    }
  };
};

//获取可滚动元素已滚的距离scrollTop
var getScrollTop = function(element) {
  if (element === window) {
    return Math.max(window.pageYOffset || 0, document.documentElement.scrollTop);
  }

  return element.scrollTop;
};

var getComputedStyle = document.defaultView.getComputedStyle;
//获取可以滚动的元素 可能是自身也可能是父节点。都不是返回window对象 且为垂直滚动
var getScrollEventTarget = function(element) {
  var currentNode = element;
  // bugfix, see http://w3help.org/zh-cn/causes/SD9013 and http://stackoverflow.com/questions/17016740/onscroll-function-is-not-working-for-chrome
  while (currentNode && currentNode.tagName !== 'HTML' && currentNode.tagName !== 'BODY' && currentNode.nodeType ===
    1) {
    var overflowY = getComputedStyle(currentNode).overflowY;
    if (overflowY === 'scroll' || overflowY === 'auto') {
      return currentNode;
    }
    currentNode = currentNode.parentNode;
  }
  return window;
};
//获取可滚动元素可是高高度
var getVisibleHeight = function(element) {
  if (element === window) {
    return document.documentElement.clientHeight;
  }

  return element.clientHeight;
};

var getElementTop = function(element) {
  if (element === window) {
    return getScrollTop(window);
  }
  return element.getBoundingClientRect().top + getScrollTop(window);
};

var isAttached = function(element) {
  //parentNode属性返回当前节点的父节点
  var currentNode = element.parentNode;
  while (currentNode) {
    //判断元素标签是否为HTML
    if (currentNode.tagName === 'HTML') {
      return true;
    }
     //判断父节点类型是否为文档片段
    if (currentNode.nodeType === 11) {
      return false;
    }
    currentNode = currentNode.parentNode;
  }
  return false;
};

var doBind = function() {
  if (this.binded) return; // eslint-disable-line
  this.binded = true;

  var directive = this;
  var element = directive.el;
  //获取绑定节点是设置了节流间隔时间，如果没有使用默认200 infinite-scroll-throttle-delay
  var throttleDelayExpr = element.getAttribute('infinite-scroll-throttle-delay');
  var throttleDelay = 200;
  if (throttleDelayExpr) {
    //校验防止设置出错
    throttleDelay = Number(directive.vm[throttleDelayExpr] || throttleDelayExpr);
    if (isNaN(throttleDelay) || throttleDelay < 0) {
      throttleDelay = 200;
    }
  }
  directive.throttleDelay = throttleDelay;
  //获取当前节点可以滚动元素（可能自身不可滚动，但父元素额设置了overflowY：scroll或者aoto）
  directive.scrollEventTarget = getScrollEventTarget(element);
  //滚动事件同时设置节流（fn，time） 通过apply执行doCheak函数
  directive.scrollListener = throttle(doCheck.bind(directive), directive.throttleDelay);
  //设置滚动接听
  directive.scrollEventTarget.addEventListener('scroll', directive.scrollListener);
  //销毁监听事件（这种removeEventListener不兼容低版本浏览IE8以及很早版本）
  this.vm.$on('hook:beforeDestroy', function() {
    directive.scrollEventTarget.removeEventListener('scroll', directive.scrollListener);
  });
  //通过监听infinite-scroll-disabled的boolean判断是否执行方法
  var disabledExpr = element.getAttribute('infinite-scroll-disabled');
  var disabled = false;

  if (disabledExpr) {
    this.vm.$watch(disabledExpr, function(value) {
      directive.disabled = value;
      if (!value && directive.immediateCheck) {
        doCheck.call(directive);
      }
    });
    //Boolean(directive.vm[disabledExpr]);转化防止出错
    disabled = Boolean(directive.vm[disabledExpr]);
  }
  directive.disabled = disabled;
  //infinite-scroll-distance属性来设置到什么位置滚动
  var distanceExpr = element.getAttribute('infinite-scroll-distance');
  var distance = 0;
  if (distanceExpr) {
    //转化和校验
    distance = Number(directive.vm[distanceExpr] || distanceExpr);
    if (isNaN(distance)) {
      distance = 0;
    }
  }
  directive.distance = distance;
  //立即执行
  var immediateCheckExpr = element.getAttribute('infinite-scroll-immediate-check');
  var immediateCheck = true;
  if (immediateCheckExpr) {
    immediateCheck = Boolean(directive.vm[immediateCheckExpr]);
  }
  directive.immediateCheck = immediateCheck;

  if (immediateCheck) {
    doCheck.call(directive);
  }
  //当事件在Vue实例中发出时，无限滚动将再次检查。
  var eventName = element.getAttribute('infinite-scroll-listen-for-event');
  if (eventName) {
    directive.vm.$on(eventName, function() {
      doCheck.call(directive);
    });
  }
};
/**
 * @param {Object} force
 * desc :这个函数用于判断是否已经滚动到底部，可以说是整个插件的核心逻辑。
 * 由于滚动的元素可以是自身，也可以是某个父元素，所以判断会分成两个分支。
 */
var doCheck = function(force) {
  //// 将可以滚动的元素设置变量元素
  var scrollEventTarget = this.scrollEventTarget;
  var element = this.el;

  var distance = this.distance;
  //disabled是否执行函数
  if (force !== true && this.disabled) return; //eslint-disable-line
  //获取滚动的距离
  var viewportScrollTop = getScrollTop(scrollEventTarget);
  //高高度+已滚动的高度 为实际滚动的高度
  var viewportBottom = viewportScrollTop + getVisibleHeight(scrollEventTarget);

  var shouldTrigger = false;

  if (scrollEventTarget === element) {
    //判断是否已到最低滚动距离
    shouldTrigger = scrollEventTarget.scrollHeight - viewportBottom <= distance;
  } else {
    //如何当前是window情况下才会执行的方法也就是监听整个doc文档的高度
    var elementBottom = getElementTop(element) - getElementTop(scrollEventTarget) + element.offsetHeight +
      viewportScrollTop;

    shouldTrigger = viewportBottom + distance >= elementBottom;
  }

  if (shouldTrigger && this.expression) {
    //执行vue自定义组件等号后面的表达式函数
    this.expression();
  }
};

export default {
  bind(el, binding, vnode) {
    el[ctx] = {
      el,
      vm: vnode.context,
      expression: binding.value
    };
    const args = arguments;
    el[ctx].vm.$on('hook:mounted', function() {
      el[ctx].vm.$nextTick(function() {
        //判断节点是否在HTML文档中
        if (isAttached(el)) {
          doBind.call(el[ctx], args);
        }

        el[ctx].bindTryCount = 0;
        //在vue自定义指定中bind生命周期无法保证元素是否已挂载到dom树上，所以vue-infinite-scroll采用轮询10次的方式
        var tryBind = function() {
          if (el[ctx].bindTryCount > 10) return; //eslint-disable-line
          el[ctx].bindTryCount++;
          if (isAttached(el)) {
            doBind.call(el[ctx], args);
          } else {
            setTimeout(tryBind, 50);
          }
        };

        tryBind();
      });
    });
  },

  unbind(el) {
    if (el && el[ctx] && el[ctx].scrollEventTarget)
      el[ctx].scrollEventTarget.removeEventListener('scroll', el[ctx].scrollListener);
  }
};
