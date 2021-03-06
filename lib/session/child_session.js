var get = Ember.get, set = Ember.set;

/**
  Child sessions are useful to keep changes isolated
  from parent sessions until flush time.
*/
Ep.ChildSession = Ep.Session.extend({

  load: function(type, id) {
    if(typeof type === "string") {
      type = this.lookupType(type);
    }
    // always coerce to string
    id = id.toString();

    var cached = this.getForId(type, id);
    if(cached && get(cached, 'isLoaded')) {
      return Ep.resolveModel(cached);
    }

    // load and resolve immediately if the parent already has it loaded
    var parentModel = get(this, 'parent').getForId(type, id);
    if(parentModel && get(parentModel, 'isLoaded')) {
      return Ep.resolveModel(this.merge(parentModel));
    }

    var session = this;
    return Ep.resolveModel(this.parent.load(type, id).then(function(model) {
      return session.merge(model);
    }, function(model) {
      throw session.merge(model);
    }), type, id, session);
  },

  query: function(type, query) {
    var session = this;
    return this.parent.query(type, query).then(function(models) {
      // TODO: model array could automatically add to session?
      var merged = Ep.ModelArray.create({session: session, content: []});
      set(merged, 'meta', get(models, 'meta'));
      models.forEach(function(model) {
        merged.addObject(session.merge(model));
      });
      return merged;
    });
  },

  refresh: function(model) {
    var session = this;
    return this.parent.refresh(model).then(function(refreshedModel) {
      return session.merge(refreshedModel);
    }, function(refreshedModel) {
      throw session.merge(refreshedModel);
    });
  },

  flush: function() {
    var session = this,
        dirtyModels = get(this, 'dirtyModels'),
        shadows = get(this, 'shadows'),
        parent = this.parent;

    // flush all local updates to the parent session
    var dirty = get(this, 'dirtyModels');
    // TODO: merge in latest from parent first? (essentially making this a rebase)
    dirty.forEach(function(model) {
      parent.update(model);
    });

    // TODO: how do we isolate this flush to *only* child models
    var promise = parent.flush().then(function(models) {
      var res = models.map(function(model) {
        return session.merge(model);
      });
      return models;
    }, function(models) {
      var res = models.map(function(model) {
        return session.merge(model);
      });
      throw models;
    });

    // update shadows with current models
    dirtyModels.forEach(function(model) {
      this.shadows.add(model.copy());
    }, this);

    return promise;
  },

  reifyClientId: function(model) {
    return this.parent.reifyClientId(model);
  },

  getForId: function(type, id) {
    var adapter = get(this.parent, 'adapter');
    var clientId = adapter.getClientId(type, id);
    return this.models.getForClientId(clientId);
  },

  remoteCall: function(context, name) {
    var session = this;
    return this.parent.remoteCall.apply(this.parent, arguments).then(function(model) {
      return session.merge(model);
    }, function(model) {
      throw session.merge(model);
    });
  }


});