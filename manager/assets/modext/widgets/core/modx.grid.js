Ext.namespace('MODx.grid');

MODx.grid.Grid = function(config) {
    config = config || {};
    this.config = config;
    this._loadStore();
    this._loadColumnModel();
	
    Ext.applyIf(config,{
        store: this.store
        ,cm: this.cm
        ,sm: new Ext.grid.RowSelectionModel({singleSelect:true})
        ,paging: (config.bbar ? true : false)
        ,loadMask: true
        ,autoHeight: true
        ,collapsible: true
        ,stripeRows: true
        ,header: false
        ,cls: 'modx-grid'
        ,preventSaveRefresh: true
        ,menuConfig: {
            defaultAlign: 'tl-b?'
            ,enableScrolling: false
        }
        ,viewConfig: {
            forceFit: true
            ,enableRowBody: true
            ,autoFill: true
            ,showPreview: true
            ,scrollOffset: 0
            ,emptyText: config.emptyText || _('ext_emptymsg')
        }
    });
    if (config.paging) {
        Ext.applyIf(config,{
            bbar: new Ext.PagingToolbar({
                pageSize: config.pageSize || (MODx.config.default_per_page || 20)
                ,store: this.getStore()
                ,displayInfo: true
                ,items: config.pagingItems || ['-',_('per_page')+':',{
                    xtype: 'textfield'
                    ,value: config.pageSize || (MODx.config.default_per_page || 20)
                    ,width: 40
                    ,listeners: {
                        'change': {fn:function(tf,nv,ov) {
                            this.getBottomToolbar().pageSize = nv;
                            this.store.load({params:{
                                start:0
                                ,limit: nv
                            }});
                        },scope:this}
                    }
                }]
            })
        });
    }
    if (config.grouping) {
        Ext.applyIf(config,{
          view: new Ext.grid.GroupingView({ 
            forceFit: true 
            ,scrollOffset: 0
            ,groupTextTpl: '{text} ({[values.rs.length]} {[values.rs.length > 1 ? "'
                +(config.pluralText || _('records')) + '" : "'
                +(config.singleText || _('record'))+'"]})' 
          })
        });
    }
    if (config.tbar) {
        for (var i = 0;i<config.tbar.length;i++) {
            var itm = config.tbar[i];
            if (itm.handler && typeof(itm.handler) == 'object' && itm.handler.xtype) {
                itm.handler = this.loadWindow.createDelegate(this,[itm.handler],true);
            }
            if (!itm.scope) { itm.scope = this; }
        }
    }
    MODx.grid.Grid.superclass.constructor.call(this,config);
    this._loadMenu(config);
    this.addEvents({
        beforeRemoveRow: true
        ,afterRemoveRow: true
    });
    if (!config.preventRender) { this.render(); }
	
    this.on('rowcontextmenu',this._showMenu,this);    
    if (config.autosave) {
        this.on('afteredit',this.saveRecord,this);
    }
	
    if (config.paging && config.grouping) {
        this.getBottomToolbar().bind(this.store);
    }

    this.getStore().load({
        params: {
            start: config.pageStart || 0
            ,limit: config.pageSize || 20
        }
        ,scope: this
        ,callback: function() { this.getStore().reload(); } /* fixes comboeditor bug */
    });
    this.getStore().on('exception',this.onStoreException,this);
    this.config = config;
};
Ext.extend(MODx.grid.Grid,Ext.grid.EditorGridPanel,{
    windows: {}

    ,onStoreException: function(dp,type,act,opt,resp){
        var r = Ext.decode(resp.responseText);
        if (r.message) {
            this.getView().emptyText = r.message;
            this.getView().refresh(false);
        }
    }
    
    ,saveRecord: function(e) {
        e.record.data.menu = null;
        var p = this.config.saveParams || {};
        Ext.apply(e.record.data,p);
        var d = Ext.util.JSON.encode(e.record.data);
        var url = this.config.saveUrl || (this.config.url || this.config.connector);
        MODx.Ajax.request({
            url: url
            ,params: {
                action: this.config.save_action || 'updateFromGrid'
                ,data: d
            }
            ,listeners: {
                'success': {fn:function(r) {
                    if (this.config.save_callback) {
                        Ext.callback(this.config.save_callback,this.config.scope || this,[r]);
                    }
                    e.record.commit();
                    if (!this.config.preventSaveRefresh) {
                        this.refresh();
                    }
                },scope:this}
            }
        });
        return true;
    }
    
    ,loadWindow: function(btn,e,win,or) {
        var r = this.menu.record;
        if (!this.windows[win.xtype] || win.force) {  
            Ext.applyIf(win,{
                record: win.blankValues ? {} : r
                ,grid: this
                ,listeners: {
                    'success': {fn:win.success || this.refresh,scope:win.scope || this}
                }
            });
            if (or) {
                Ext.apply(win,or);
            }
            this.windows[win.xtype] = Ext.ComponentMgr.create(win);
        }
        if (this.windows[win.xtype].setValues && win.blankValues !== true && r != undefined) {
            this.windows[win.xtype].setValues(r);
        }
        this.windows[win.xtype].show(e.target);
    }
    
    ,confirm: function(type,text) {
        var p = { action: type };
        var k = this.config.primaryKey || 'id';
        p[k] = this.menu.record[k];
        
        MODx.msg.confirm({
            title: _(type)
            ,text: _(text) || _('confirm_remove')
            ,url: this.config.url
            ,params: p
            ,listeners: {
            	'success': {fn:this.refresh,scope:this}
            }
        });
    }
    
    ,remove: function(text) {
        var r = this.menu.record;
        text = text || 'confirm_remove';
        var p = this.config.saveParams || {};
        Ext.apply(p,{ action: 'remove' });
        var k = this.config.primaryKey || 'id';
        p[k] = r[k];
        
        if (this.fireEvent('beforeRemoveRow',r)) {
            MODx.msg.confirm({
                title: _('warning')
                ,text: _(text)
                ,url: this.config.url
                ,params: p
                ,listeners: {
                	'success': {fn:function() {
                        this.removeActiveRow(r);
                    },scope:this}
                }
            });
        }
    }
    
    ,removeActiveRow: function(r) {
        if (this.fireEvent('afterRemoveRow',r)) {
            var rx = this.getSelectionModel().getSelected();
            this.getStore().remove(rx);
        }
    }
    
    ,_loadMenu: function() {
        this.menu = new Ext.menu.Menu(this.config.menuConfig);
    }

    ,_showMenu: function(g,ri,e) {
        e.stopEvent();
        e.preventDefault();
        this.menu.record = this.getStore().getAt(ri).data;
        if (!this.getSelectionModel().isSelected(ri)) {
            this.getSelectionModel().selectRow(ri);
        }
        this.menu.removeAll();
        if (this.getMenu) { this.getMenu(g,ri,e); }
        if (this.menu.record.menu) {
            this.addContextMenuItem(this.menu.record.menu);
        }
        if (this.menu.items.length > 0) {
            this.menu.showAt(e.xy);
        }
    }
    
    ,_loadStore: function() {
        if (this.config.grouping) {
            this.store = new Ext.data.GroupingStore({
                url: this.config.url
                ,baseParams: this.config.baseParams || { action: this.config.action || 'getList'}
                ,reader: new Ext.data.JsonReader({
                    totalProperty: 'total'
                    ,root: 'results'
                    ,fields: this.config.fields
                })
                ,sortInfo:{
                    field: this.config.sortBy || 'name'
                    ,direction: this.config.sortDir || 'ASC'
                }
                ,groupField: this.config.groupBy || 'name'
                ,storeId: this.config.storeId || Ext.id()
                ,autoDestroy: true
            });
        } else {
            this.store = new Ext.data.JsonStore({
                url: this.config.url
                ,baseParams: this.config.baseParams || { action: this.config.action || 'getList' }
                ,fields: this.config.fields
                ,root: 'results'
                ,totalProperty: 'total'
                ,remoteSort: this.config.remoteSort || false
                ,storeId: this.config.storeId || Ext.id()
                ,autoDestroy: true
            });
        }
    }
    
    ,_loadColumnModel: function() {
        if (this.config.columns) {
            var c = this.config.columns;
            for (var i=0;i<c.length;i++) {
                // if specifying custom editor/renderer
                if (typeof(c[i].editor) == 'string') {
                    c[i].editor = eval(c[i].editor);
                }
                if (typeof(c[i].renderer) == 'string') {
                    c[i].renderer = eval(c[i].renderer);
                }
                if (typeof(c[i].editor) == 'object' && c[i].editor.xtype) {
                    var r = c[i].editor.renderer;
                    c[i].editor = Ext.ComponentMgr.create(c[i].editor);
                    if (r === true) {
                        c[i].renderer = MODx.combo.Renderer(c[i].editor);
                    } else if (c[i].editor.initialConfig.xtype === 'datefield') {
                        c[i].renderer = Ext.util.Format.dateRenderer(c[i].editor.initialConfig.format || 'Y-m-d');
                    } else if (r === 'boolean') {
                        c[i].renderer = this.rendYesNo;
                    } else if (r === 'local' && typeof(c[i].renderer) == 'string') {
                        c[i].renderer = eval(c[i].renderer);
                    }
                }
            }
            this.cm = new Ext.grid.ColumnModel(c);
        }
    }
    
    ,addContextMenuItem: function(items) {
        var a = items, l = a.length;
        for(var i = 0; i < l; i++) {
            var options = a[i];
            
            if (options == '-') {
                this.menu.add('-');
                continue;
            }
            var h = Ext.emptyFn;
            if (options.handler) {
                h = eval(options.handler);
                if (h && typeof(h) == 'object' && h.xtype) {
                    h = this.loadWindow.createDelegate(this,[h],true);
                }
            } else {
                h = function(itm,e) {
                    var o = itm.options;
                    var id = this.menu.record.id;
                    if (o.confirm) {
                        Ext.Msg.confirm('',o.confirm,function(e) {
                            if (e == 'yes') {
                                var a = Ext.urlEncode(o.params || {action: o.action});
                                var s = 'index.php?id='+id+'&'+a;
                                location.href = s;
                            }
                        },this);
                    } else {
                        var a = Ext.urlEncode(o.params || {action: o.action});
                        var s = 'index.php?id='+id+'&'+a;
                        location.href = s;
                    }
                };
            }
            this.menu.add({
                id: options.id || Ext.id()
                ,text: options.text
                ,scope: options.scope || this
                ,options: options
                ,handler: h
            });
        }
    }
    
    ,refresh: function() {
        this.getStore().reload();
    }
    
    ,rendYesNo: function(v,md) {
        if (v === 1 || v == '1') { v = true; }
        if (v === 0 || v == '0') { v = false; }
        switch (v) {
            case true:
            case 'true':
            case 1:
                md.css = 'green';
                return _('yes');
            case false:
            case 'false':
            case '':
            case 0:
                md.css = 'red';
                return _('no');
        }
    }

    ,getSelectedAsList: function() {
        var sels = this.getSelectionModel().getSelections();
        if (sels.length <= 0) return false;

        var cs = '';
        for (var i=0;i<sels.length;i++) {
            cs += ','+sels[i].data.id;
        }

        if (cs[0] == ',') {
            cs = cs.substr(1);
        }
        return cs;
    }
    
    ,editorYesNo: function(r) {
    	r = r || {};
    	Ext.applyIf(r,{
            store: new Ext.data.SimpleStore({
                fields: ['d','v']
                ,data: [[_('yes'),true],[_('no'),false]]
            })
            ,displayField: 'd'
            ,valueField: 'v'
            ,mode: 'local'
            ,triggerAction: 'all'
            ,editable: false
            ,selectOnFocus: false
        });
        return new Ext.form.ComboBox(r);
    }
    
    ,encodeModified: function() {
        var p = this.getStore().getModifiedRecords();
        var rs = {};
        for (var i=0;i<p.length;i++) {
            rs[p[i].data[this.config.primaryKey || 'id']] = p[i].data;
        }
        return Ext.encode(rs);
    }
    ,encode: function() {
        var p = this.getStore().getRange();
        var rs = {};
        for (var i=0;i<p.length;i++) {
            rs[p[i].data[this.config.primaryKey || 'id']] = p[i].data;
        }
        return Ext.encode(rs);
    }
    
    ,expandAll: function() {
        if (!this.exp) return false;
        
        this.exp.expandAll(); 
        this.tools['plus'].hide();
        this.tools['minus'].show();
        return true;
    }
    
    ,collapseAll: function() {
        if (!this.exp) return false;
        
        this.exp.collapseAll();
        this.tools['minus'].hide();
        this.tools['plus'].show();
        return true;
    }
});

/* local grid */
MODx.grid.LocalGrid = function(config) {
    config = config || {};
    
    if (config.grouping) {
        Ext.applyIf(config,{
          view: new Ext.grid.GroupingView({ 
            forceFit: true 
            ,scrollOffset: 0
            ,groupTextTpl: '{text} ({[values.rs.length]} {[values.rs.length > 1 ? "'
                +(config.pluralText || _('records')) + '" : "'
                +(config.singleText || _('record'))+'"]})' 
          })
        });
    }
    if (config.tbar) {
        for (var i = 0;i<config.tbar.length;i++) {
            var itm = config.tbar[i];
            if (itm.handler && typeof(itm.handler) == 'object' && itm.handler.xtype) {
                itm.handler = this.loadWindow.createDelegate(this,[itm.handler],true);
            }
            if (!itm.scope) { itm.scope = this; }
        }
    }
    Ext.applyIf(config,{
        title: ''
        ,store: this._loadStore(config)
        ,sm: new Ext.grid.RowSelectionModel({singleSelect:false})
        ,loadMask: true
        ,collapsible: true
        ,stripeRows: true
        ,enableColumnMove: true
        ,header: false
        ,cls: 'modx-grid'
        ,viewConfig: {
            forceFit: true
            ,enableRowBody: true
            ,autoFill: true
            ,showPreview: true
            ,scrollOffset: 0
            ,emptyText: config.emptyText || _('ext_emptymsg')
        }
        ,menuConfig: { defaultAlign: 'tl-b?' ,enableScrolling: false }
    });
    
    this.menu = new Ext.menu.Menu(config.menuConfig);
    this.config = config;
    this._loadColumnModel();
    MODx.grid.LocalGrid.superclass.constructor.call(this,config);
    this.addEvents({
        beforeRemoveRow: true
        ,afterRemoveRow: true
    });
    this.on('rowcontextmenu',this._showMenu,this);
};
Ext.extend(MODx.grid.LocalGrid,Ext.grid.EditorGridPanel,{
    windows: {}
    
    ,_loadStore: function(config) {
        if (config.grouping) {
            this.store = new Ext.data.GroupingStore({
                data: config.data || []
                ,reader: new Ext.data.ArrayReader({},config.fields || [])
                ,sortInfo:{
                    field: config.sortBy || 'name'
                    ,direction: config.sortDir || 'ASC'
                }
                ,groupField: config.groupBy || 'name'
            });
        } else {
            this.store = new Ext.data.SimpleStore({
                fields: config.fields
                ,data: config.data || []
            })
        }
        return this.store;
    }
    
    ,loadWindow: function(btn,e,win,or) {
        var r = this.menu.record;
        if (!this.windows[win.xtype]) {  
            Ext.applyIf(win,{
                scope: this
                ,success: this.refresh
                ,record: win.blankValues ? {} : r
            });
            if (or) {
                Ext.apply(win,or);
            }
            this.windows[win.xtype] = Ext.ComponentMgr.create(win);
        }
        if (this.windows[win.xtype].setValues && win.blankValues !== true && r != undefined) {
            this.windows[win.xtype].setValues(r);
        }
        this.windows[win.xtype].show(e.target);
    }
    
    ,_loadColumnModel: function() {
        if (this.config.columns) {
            var c = this.config.columns;
            for (var i=0;i<c.length;i++) {
                if (typeof(c[i].editor) == 'string') {
                    c[i].editor = eval(c[i].editor);
                }
                if (typeof(c[i].renderer) == 'string') {
                    c[i].renderer = eval(c[i].renderer);
                }
                if (typeof(c[i].editor) == 'object' && c[i].editor.xtype) {
                    var r = c[i].editor.renderer;
                    c[i].editor = Ext.ComponentMgr.create(c[i].editor);
                    if (r === true) {
                        c[i].renderer = MODx.combo.Renderer(c[i].editor);
                    } else if (c[i].editor.initialConfig.xtype === 'datefield') {
                        c[i].renderer = Ext.util.Format.dateRenderer(c[i].editor.initialConfig.format || 'Y-m-d');
                    } else if (r === 'boolean') {
                        c[i].renderer = this.rendYesNo;
                    } else if (r === 'local' && typeof(c[i].renderer) == 'string') {
                        c[i].renderer = eval(c[i].renderer);
                    }
                }
            }
            this.cm = new Ext.grid.ColumnModel(c);
        }
    }
    
    ,_showMenu: function(g,ri,e) {
        e.stopEvent();
        e.preventDefault();
        this.menu.recordIndex = ri;
        this.menu.record = this.getStore().getAt(ri).data;
        if (!this.getSelectionModel().isSelected(ri)) {
            this.getSelectionModel().selectRow(ri);
        }
        this.menu.removeAll();
        var m = this.getMenu(g,ri);
        if (m) {
            this.addContextMenuItem(m);
            this.menu.showAt(e.xy);
        }
    }
    
    ,getMenu: function() {
        return this.menu.record.menu;
    }
    
    ,addContextMenuItem: function(items) {
        var a = items, l = a.length;
        for(var i = 0; i < l; i++) {
            var options = a[i];
            
            if (options == '-') {
                this.menu.add('-');
                continue;
            }
            var h = Ext.emptyFn;
            if (options.handler) {
                h = eval(options.handler);
                if (h && typeof(h) == 'object' && h.xtype) {
                    h = this.loadWindow.createDelegate(this,[h],true);
                }
            } else {
                h = function(itm,e) {
                    var o = itm.options;
                    var id = this.menu.record.id;
                    var w = Ext.get('modx_content');
                    if (o.confirm) {
                        Ext.Msg.confirm('',o.confirm,function(e) {
                            if (e == 'yes') {
                                var a = Ext.urlEncode(o.params || {action: o.action});
                                var s = 'index.php?id='+id+'&'+a;
                                if (w === null) {
                                    location.href = s;
                                } else { w.dom.src = s; }
                            }
                        },this);
                    } else {
                        var a = Ext.urlEncode(o.params || {action: o.action});
                        var s = 'index.php?id='+id+'&'+a;
                        if (w === null) {
                            location.href = s;
                        } else { w.dom.src = s; }
                    }
                };
            }
            this.menu.add({
                id: options.id || Ext.id()
                ,text: options.text
                ,scope: this
                ,options: options
                ,handler: h
            });
        }
    }
    
    
    ,remove: function(config) {
        var r = this.getSelectionModel().getSelected();
        if (this.fireEvent('beforeRemoveRow',r)) {
            Ext.Msg.confirm(config.title || '',config.text || '',function(e) {
                if (e == 'yes') {
                    this.getStore().remove(r);
                    this.fireEvent('afterRemoveRow',r);
                }
            },this);
        }
    }
    
    ,encode: function() {
        var s = this.getStore();
        var ct = s.getCount();
        var rs = this.config.encodeByPk ? {} : [];
        var r;
        for (var j=0;j<ct;j++) {
            r = s.getAt(j).data;
            r.menu = null;
            if (this.config.encodeAssoc) {
               rs[r[this.config.encodeByPk || 'id']] = r;
            } else {
               rs.push(r);
            }
        }
        
        return Ext.encode(rs);
    }
    
    
    ,expandAll: function() {
        if (!this.exp) return false;
        
        this.exp.expandAll(); 
        this.tools['plus'].hide();
        this.tools['minus'].show();
        return true;
    }
    
    ,collapseAll: function() {
        if (!this.exp) return false;
        
        this.exp.collapseAll();
        this.tools['minus'].hide();
        this.tools['plus'].show();
        return true;
    }
    ,rendYesNo: function(d,c) {
        switch(d) {
            case '':
                return '-';
            case false:
                c.css = 'red';
                return _('no');
            case true:
                c.css = 'green';
                return _('yes');
        }
    }
});
Ext.reg('grid-local',MODx.grid.LocalGrid);
Ext.reg('modx-grid-local',MODx.grid.LocalGrid);

/* grid extensions */
Ext.ns('Ext.ux.grid');Ext.ux.grid.RowExpander=Ext.extend(Ext.util.Observable,{expandOnEnter:true,expandOnDblClick:true,header:'',width:20,sortable:false,fixed:true,menuDisabled:true,dataIndex:'',id:'expander',lazyRender:true,enableCaching:false,constructor:function(a){Ext.apply(this,a);this.addEvents({beforeexpand:true,expand:true,beforecollapse:true,collapse:true});Ext.ux.grid.RowExpander.superclass.constructor.call(this);if(this.tpl){if(typeof this.tpl=='string'){this.tpl=new Ext.Template(this.tpl)}this.tpl.compile()}this.state={};this.bodyContent={}},getRowClass:function(a,b,p,c){p.cols=p.cols-1;var d=this.bodyContent[a.id];if(!d&&!this.lazyRender){d=this.getBodyContent(a,b)}if(d){p.body=d}return this.state[a.id]?'x-grid3-row-expanded':'x-grid3-row-collapsed'},init:function(a){this.grid=a;var b=a.getView();b.getRowClass=this.getRowClass.createDelegate(this);b.enableRowBody=true;a.on('render',this.onRender,this);a.on('destroy',this.onDestroy,this)},onRender:function(){var a=this.grid;var b=a.getView().mainBody;b.on('mousedown',this.onMouseDown,this,{delegate:'.x-grid3-row-expander'});if(this.expandOnEnter){this.keyNav=new Ext.KeyNav(this.grid.getGridEl(),{'enter':this.onEnter,scope:this})}if(this.expandOnDblClick){a.on('rowdblclick',this.onRowDblClick,this)}},onDestroy:function(){this.keyNav.disable();delete this.keyNav;var a=this.grid.getView().mainBody;a.un('mousedown',this.onMouseDown,this)},onRowDblClick:function(a,b,e){this.toggleRow(b)},onEnter:function(e){var g=this.grid;var a=g.getSelectionModel();var b=a.getSelections();for(var i=0,len=b.length;i<len;i++){var c=g.getStore().indexOf(b[i]);this.toggleRow(c)}},getBodyContent:function(a,b){if(!this.enableCaching){return this.tpl.apply(a.data)}var c=this.bodyContent[a.id];if(!c){c=this.tpl.apply(a.data);this.bodyContent[a.id]=c}return c},onMouseDown:function(e,t){e.stopEvent();var a=e.getTarget('.x-grid3-row');this.toggleRow(a)},renderer:function(v,p,a){p.cellAttr='rowspan="2"';if(a.data.description!==null&&a.data.description===''){return''}return'<div class="x-grid3-row-expander">&#160;</div>'},beforeExpand:function(a,b,c){if(this.fireEvent('beforeexpand',this,a,b,c)!==false){if(this.tpl&&this.lazyRender){b.innerHTML=this.getBodyContent(a,c)}return true}else{return false}},toggleRow:function(a){if(typeof a=='number'){a=this.grid.view.getRow(a)}this[Ext.fly(a).hasClass('x-grid3-row-collapsed')?'expandRow':'collapseRow'](a)},expandRow:function(a){if(typeof a=='number'){a=this.grid.view.getRow(a)}var b=this.grid.store.getAt(a.rowIndex);var c=Ext.DomQuery.selectNode('tr:nth(2) div.x-grid3-row-body',a);if(this.beforeExpand(b,c,a.rowIndex)){this.state[b.id]=true;Ext.fly(a).replaceClass('x-grid3-row-collapsed','x-grid3-row-expanded');this.fireEvent('expand',this,b,c,a.rowIndex)}},collapseRow:function(a){if(typeof a=='number'){a=this.grid.view.getRow(a)}var b=this.grid.store.getAt(a.rowIndex);var c=Ext.fly(a).child('tr:nth(1) div.x-grid3-row-body',true);if(this.fireEvent('beforecollapse',this,b,c,a.rowIndex)!==false){this.state[b.id]=false;Ext.fly(a).replaceClass('x-grid3-row-expanded','x-grid3-row-collapsed');this.fireEvent('collapse',this,b,c,a.rowIndex)}},expandAll:function(){var a=this.grid.getView().getRows();for(var i=0;i<a.length;i++){this.expandRow(a[i])}},collapseAll:function(){var a=this.grid.getView().getRows();for(var i=0;i<a.length;i++){this.collapseRow(a[i])}}});Ext.preg('rowexpander',Ext.ux.grid.RowExpander);Ext.grid.RowExpander=Ext.ux.grid.RowExpander;Ext.ns('Ext.ux.grid');Ext.ux.grid.CheckColumn=function(a){Ext.apply(this,a);if(!this.id){this.id=Ext.id()}this.renderer=this.renderer.createDelegate(this)};Ext.ux.grid.CheckColumn.prototype={init:function(b){this.grid=b;this.grid.on('render',function(){var a=this.grid.getView();a.mainBody.on('mousedown',this.onMouseDown,this)},this)},onMouseDown:function(e,t){this.grid.fireEvent('rowclick');if(t.className&&t.className.indexOf('x-grid3-cc-'+this.id)!=-1){e.stopEvent();var a=this.grid.getView().findRowIndex(t);var b=this.grid.store.getAt(a);b.set(this.dataIndex,!b.data[this.dataIndex]);this.grid.fireEvent('afteredit')}},renderer:function(v,p,a){p.css+=' x-grid3-check-col-td';return'<div class="x-grid3-check-col'+(v?'-on':'')+' x-grid3-cc-'+this.id+'">&#160;</div>'}};Ext.preg('checkcolumn',Ext.ux.grid.CheckColumn);Ext.grid.CheckColumn=Ext.ux.grid.CheckColumn;Ext.grid.PropertyColumnModel=function(a,b){var g=Ext.grid,f=Ext.form;this.grid=a;g.PropertyColumnModel.superclass.constructor.call(this,[{header:this.nameText,width:50,sortable:true,dataIndex:'name',id:'name',menuDisabled:true},{header:this.valueText,width:50,resizable:false,dataIndex:'value',id:'value',menuDisabled:true}]);this.store=b;var c=new f.Field({autoCreate:{tag:'select',children:[{tag:'option',value:'true',html:'true'},{tag:'option',value:'false',html:'false'}]},getValue:function(){return this.el.dom.value=='true'}});this.editors={'date':new g.GridEditor(new f.DateField({selectOnFocus:true})),'string':new g.GridEditor(new f.TextField({selectOnFocus:true})),'number':new g.GridEditor(new f.NumberField({selectOnFocus:true,style:'text-align:left;'})),'boolean':new g.GridEditor(c)};this.renderCellDelegate=this.renderCell.createDelegate(this);this.renderPropDelegate=this.renderProp.createDelegate(this)};Ext.extend(Ext.grid.PropertyColumnModel,Ext.grid.ColumnModel,{nameText:'Name',valueText:'Value',dateFormat:'m/j/Y',renderDate:function(a){return a.dateFormat(this.dateFormat)},renderBool:function(a){return a?'true':'false'},isCellEditable:function(a,b){return a==1},getRenderer:function(a){return a==1?this.renderCellDelegate:this.renderPropDelegate},renderProp:function(v){return this.getPropertyName(v)},renderCell:function(a){var b=a;if(Ext.isDate(a)){b=this.renderDate(a)}else if(typeof a=='boolean'){b=this.renderBool(a)}return Ext.util.Format.htmlEncode(b)},getPropertyName:function(a){var b=this.grid.propertyNames;return b&&b[a]?b[a]:a},getCellEditor:function(a,b){var p=this.store.getProperty(b),n=p.data.name,val=p.data.value;if(this.grid.customEditors[n]){return this.grid.customEditors[n]}if(Ext.isDate(val)){return this.editors.date}else if(typeof val=='number'){return this.editors.number}else if(typeof val=='boolean'){return this.editors['boolean']}else{return this.editors.string}},destroy:function(){Ext.grid.PropertyColumnModel.superclass.destroy.call(this);for(var a in this.editors){Ext.destroy(a)}}});