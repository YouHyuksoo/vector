/**
 * @file diagnostics-channel-mock.cjs
 * @description Node 12/14 호환 diagnostics_channel 모의 모듈
 */
var _ch = function() {
  return { hasSubscribers: false, publish: function(){}, subscribe: function(){}, unsubscribe: function(){} };
};

module.exports = {
  channel: function(n) { return _ch(); },
  hasSubscribers: function() { return false; },
  Channel: function(n) {
    this.name = n;
    this.hasSubscribers = false;
    this.publish = function(){};
    this.subscribe = function(){};
    this.unsubscribe = function(){};
  },
  tracingChannel: function(n) {
    function trace(fn, ctx, thisArg) {
      var a = [];
      for (var i = 3; i < arguments.length; i++) a.push(arguments[i]);
      return fn.apply(thisArg, a);
    }
    return {
      start: _ch(), end: _ch(), asyncStart: _ch(), asyncEnd: _ch(), error: _ch(),
      subscribe: function(){}, unsubscribe: function(){},
      traceSync: trace, tracePromise: trace, traceCallback: trace
    };
  }
};
