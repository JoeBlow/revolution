<div id="tv-wprops-form{$tv}"></div>
{literal}

<script type="text/javascript">
// <![CDATA[
var params = {
{/literal}{foreach from=$params key=k item=v name='p'}
 '{$k}': '{$v}'{if NOT $smarty.foreach.p.last},{/if}
{/foreach}{literal}
};
var oc = {'select':{fn:function(){Ext.getCmp('modx-panel-tv').markDirty();},scope:this}};
MODx.load({
    xtype: 'panel'
    ,layout: 'form'
    ,autoHeight: true
    ,labelWidth: 150
    ,border: false
    ,items: [{
        xtype: 'combo' 
        ,fieldLabel: _('string_format')
        ,name: 'prop_format'
        ,hiddenName: 'prop_format'
        ,id: 'prop_format{/literal}{$tv}{literal}'
        ,store: new Ext.data.SimpleStore({
            fields: ['v','d']
            ,data: [['',_('none')],['Upper Case',_('upper_case')],['Lower Case',_('lower_case')],['Sentence Case',_('sentence_case')],['Capitalize',_('capitalize')]]
        })
        ,displayField: 'd'
        ,valueField: 'v'
        ,mode: 'local'
        ,editable: false
        ,forceSelection: true
        ,typeAhead: false
        ,triggerAction: 'all'
        ,value: params['format'] || ''
        ,listeners: oc
    }]
    ,renderTo: 'tv-wprops-form{/literal}{$tv}{literal}'
});
// ]]>
</script>
{/literal}