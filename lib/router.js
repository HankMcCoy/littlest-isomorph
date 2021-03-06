/*!
 * Router.js is reponsible for loading and consistently rendering React
 * components based on a JSON route configuration file.
 */
var url = require('url');
var util = require('util');
var pathToRegExp = require('path-to-regexp');
var reverend = require('reverend');
var BaseRouter = require('routr');
var when = require('when');
var CODE_TO_NAME = {
  '400': 'BadRequest',
  '401': 'Unauthorized',
  '403': 'Forbidden',
  '404': 'NotFound',
  '409': 'Conflict',
  '410': 'Gone',
  '418': 'ImATeapot',
  '429': 'TooManyRequests',
  '500': 'InternalServerError',
  '501': 'NotImplemented',
  '502': 'BadGateway',
  '503': 'ServiceUnavailable',
  '504': 'GatewayTimeout'
};
var NAME_TO_CODE = Object.keys(CODE_TO_NAME)
  .reduce(function (obj, code) {
    obj[CODE_TO_NAME[code]] = code;
    return obj;
  }, {});

/**
 * Creates a new instance of Router with the provided `options`. The available
 * options are:
 *
 *  - `routes`: An Object mapping arbitrary route names to descriptions of
 *    those routes. These descriptions should contain:
 *    - `path`: The absolute path to resolve to this route. If `path` contains
 *      `:var`-style parameters, those parameters will be provided to the
 *      instantiated React components as `params`. Required.
 *    - `head`: An optional React component class to be instantiated and
 *      rendered into {head} when this route is hit.
 *    - `body`: A React component class to be instantiated and rendered into
 *      {body} when this route is hit.
 *    - `props`: An optional Object of static information to provide to the
 *      instantiated React components.
 *    - `action`: An optional String name of an Action to perform before
 *      instantiating and React components. The Action may return a Promise if
 *      it depends on asynchronous behaviour to complete.
 */
function Router(options) {
  if (!(this instanceof Router)) {
    return new Router(options);
  }

  options = options || {};

  this.routes = options.routes || {};
  this.defaults = options.defaults || {};
  this.errors = options.errors || {};

  this._router = new BaseRouter(this._getRoutrTable());
}
Router.createRouter = Router;

/**
 * Builds a `routr`-compatible route table from the Router's configuration.
 */
Router.prototype._getRoutrTable = function _getRoutrTable() {
  var self = this;
  var names = Object.keys(self.routes);
  var table = {};

  names.forEach(function (name) {
    var config = self.routes[name];

    config = {
      method: 'get',
      path: config.path || self.defaults.path,
      head: config.head || self.defaults.head,
      body: config.body || self.defaults.body,
      props: config.props || self.defaults.props,
      action: config.action || self.defaults.action,
      title: config.title || self.defaults.title
    };

    if (typeof config.body !== 'function') {
      throw new Error('No body component defined for "' + name + '" route.');
    }

    table[name] = config;
  });

  return table;
};

/**
 * Adds a new `name` Route to the routing table.
 */
Router.prototype.addRoute = function addRoute(name, config) {
  this.routes[name] = config;

  // HACK(schoon) - This completely rebuilds the underlying router. Add better
  // support for dynamic routes to Routr.
  this._router = new BaseRouter(this._getRoutrTable());

  return this;
};

/**
 * Adds a new `status` Route to the routing table.
 */
Router.prototype.addErrorRoute = function addErrorRoute(status, config) {
  this.errors[NAME_TO_CODE[status] || status] = config;

  return this;
};

/**
 * Returns true if and only if the two `location`s passed in are on the
 * same domain.
 */
Router.prototype.isSameDomain = function isSameDomain(one, two) {
  one = url.parse(String(one));
  two = url.parse(String(two));

  return !(one.host && two.host && one.host !== two.host);
};

/**
 * Returns a relative path to use for navigation based on the passed-in
 * `location`, a String href or Location object.
 */
Router.prototype.getPath = function getPath(location) {
  return url.parse(String(location)).pathname;
};

/**
 * Returns a Route object based on the passed-in `location`, a String href
 * or Location object.
 */
Router.prototype.getRoute = function getRoute(location) {
  var pathname = this.getPath(location);
  var route = this._router.getRoute(pathname);
  var query = url.parse(String(location), true).query;

  return this._mapRoutrRoute(route, {
    params: query
  });
};

/**
 * Returns a Route object for the given `errorCode` HTTP status code.
 */
Router.prototype.getErrorRoute = function getErrorRoute(errorCode, message) {
  var route = this.errors[errorCode] || this.errors[NAME_TO_CODE[errorCode]];

  return this._mapRoutrRoute(route, {
    status: errorCode,
    error: message || CODE_TO_NAME[errorCode]
  });
};

/**
 * Builds a valid URL for the `name` route. Any `params` are used to build
 * path fragments, eventually available through `props.route.params`.
 *
 * If `name` does not exist, `null` is returned instead.
 */
Router.prototype.getRouteUrl = function getRouteUrl(name, params) {
  var route = this.routes[name];
  var usedKeys = [];

  if (!route) {
    return null;
  }

  if (!params) {
    return route.path;
  }

  // TODO(schoon) - If this becomes significant for either bundle size, memory
  // usage, or performance, we can replace routr with (or patch routr to be) a
  // similar version that exposes the preloaded `keys` Array, for instance,
  // and optimize from there.
  usedKeys = pathToRegExp(route.path).keys
    .map(function (info) {
      return info.name;
    });

  return url.format({
    pathname: reverend(route.path, params),
    query: Object.keys(params).reduce(function (obj, key) {
      if (usedKeys.indexOf(key) === -1) {
        obj[key] = params[key];
      }

      return obj;
    }, {})
  });
};

/**
 * Internal use only.
 *
 * Maps a Routr-provided route object to a Route as expected by Router
 * consumers.
 */
Router.prototype._mapRoutrRoute = function _mapRoutrRoute(route, options) {
  if (!route) {
    return null;
  }

  options = options || {};

  return {
    status: options.status || 200,
    error: options.error || null,
    name: route.name,
    params: util._extend(route.params, options.params),
    action: route.action || route.config && route.config.action,
    head: route.head || route.config && route.config.head,
    body: route.body || route.config && route.config.body,
    props: route.props || route.config && route.config.props,
    title: route.title || route.config && route.config.title
  };
};

/*!
 * Export `Router`.
 */
module.exports = Router;
