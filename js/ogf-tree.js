/*
 * OGF-native adapter for the tree-building and layout mechanism used by
 * gedcom-svg-tree / NodeFamily.Tree.
 *
 * OGF records remain the source of truth. This module only adapts configured
 * Family -> Individual references into the ordered traversal expected by the
 * original NodeFamily algorithm, then delegates positioning and routing to
 * dagre-d3. It does not create or rewrite genealogy facts.
 */
(() => {
  'use strict';

  const app = window.OGFApp;
  const d3 = window.d3;
  const dagreD3 = window.dagreD3;
  if (!app || !d3 || !dagreD3) {
    console.error('OGF Tree requires OGFApp, D3 v5 and dagre-d3.');
    return;
  }

  const pane = document.getElementById('tree-pane');
  const canvas = document.querySelector('.tree-canvas');
  const svgElement = document.getElementById('ogf-tree-svg');
  const status = document.getElementById('tree-status');
  const orientation = document.getElementById('tree-orientation');
  const parentGenerations = document.getElementById('tree-parent-generations');
  const childGenerations = document.getElementById('tree-child-generations');
  const otherGenerations = document.getElementById('tree-other-generations');
  if (!pane || !canvas || !svgElement || !status) return;

  const svg = d3.select(svgElement);
  // Unknown gender uses the reverse of the blue-to-pink background blend:
  // pink on the left, blue on the right.
  const defs = svg.append('defs');
  const unknownGenderGradient = defs.append('linearGradient')
    .attr('id', 'ogf-unknown-gender-gradient')
    .attr('x1', '0%').attr('y1', '0%')
    .attr('x2', '100%').attr('y2', '0%');
  unknownGenderGradient.append('stop').attr('offset', '0%').attr('stop-color', 'hsl(348, 100%, 83%)');
  unknownGenderGradient.append('stop').attr('offset', '100%').attr('stop-color', 'hsl(205, 100%, 80%)');
  const inner = svg.append('g').attr('class', 'ogf-tree-inner');
  const graphRenderer = new dagreD3.render();
  let graph = null;
  let selectedId = null;
  let zoomBehavior = null;
  let renderToken = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function configuredRelationships() {
    const meta = app.getMeta() || {};
    const config = meta.tree_relationships;
    if (!config || typeof config !== 'object') return null;
    const family = config.family || {};
    const partnerFields = Array.isArray(family.partner_fields) ? family.partner_fields : [];
    const childFields = Array.isArray(family.child_fields) ? family.child_fields : [];
    if (!partnerFields.length || !childFields.length) return null;
    return {
      individualType: config.individual_type || 'Individual',
      familyType: config.family_type || 'Family',
      partnerFields,
      childFields
    };
  }

  // Keep the order of fields, YAML list values, and Family documents exactly
  // as they occur in the OGF stream. Do not sort names or IDs.
  function extractReferences(value) {
    const values = Array.isArray(value) ? value : [value];
    const result = [];
    for (const item of values) {
      const text = String(item ?? '').trim();
      const found = text.match(/@[^@\s]+@/g);
      if (found) result.push(...found);
    }
    return result;
  }

  // GEDCOM imports preserve repeated tags as suffixed OGF keys (for example
  // chil, chil_2, chil_3). A configured base key therefore covers its
  // numbered repetitions without requiring a closed list of suffixes.
  function configuredFieldValues(recordMap, fieldKeys) {
    const entries = Object.entries(recordMap || {});
    const used = new Set();
    const values = [];
    for (const configuredKey of fieldKeys) {
      const base = String(configuredKey);
      for (const [key, value] of entries) {
        const repeated = key.startsWith(`${base}_`) && /^\d+$/.test(key.slice(base.length + 1));
        if ((key === base || repeated) && !used.has(key)) {
          used.add(key);
          values.push(value);
        }
      }
    }
    return values;
  }

  function buildAdapterData() {
    const docs = app.getDocs() || [];
    const config = configuredRelationships();
    const records = new Map(docs.filter(doc => doc && doc.id).map(doc => [doc.id, doc]));
    const families = [];
    const byPartner = new Map();
    const byChild = new Map();
    const unresolved = [];

    if (!config) return { config: null, records, families, byPartner, byChild, unresolved };

    for (const record of docs) {
      if (record.type !== config.familyType) continue;
      const partnerIds = configuredFieldValues(record.map, config.partnerFields).flatMap(extractReferences);
      const childIds = configuredFieldValues(record.map, config.childFields).flatMap(extractReferences);
      const family = { id: record.id, record, partnerIds, childIds };
      families.push(family);

      for (const id of [...partnerIds, ...childIds]) {
        const target = records.get(id);
        if (!target || target.type !== config.individualType) unresolved.push({ familyId: record.id, id });
      }
      for (const id of partnerIds) {
        if (!byPartner.has(id)) byPartner.set(id, []);
        byPartner.get(id).push(family);
      }
      for (const id of childIds) {
        if (!byChild.has(id)) byChild.set(id, []);
        byChild.get(id).push(family);
      }
    }
    return { config, records, families, byPartner, byChild, unresolved };
  }

  function getRecordTitle(record, adapter) {
    if (!record) return 'Unknown record';
    const meta = app.getMeta() || {};
    const map = record.map || {};
    const configured = record.type === adapter.config.familyType ? meta.family_display_field : meta.individual_display_field;
    if (configured && app.getRecordTitle) {
      const display = app.getRecordTitle(record);
      if (display && display !== record.id) return display;
    }
    if (record.type === adapter.config.familyType) {
      const family = adapter.families.find(item => item.id === record.id);
      const names = (family?.partnerIds || []).map(id => {
        const partner = adapter.records.get(id);
        return partner ? getRecordTitle(partner, adapter) : id;
      });
      return names.join(' + ') || record.id;
    }
    if (app.getRecordTitle) return app.getRecordTitle(record);
    return String(map.name || map.title || record.id);
  }

  function createOrderedTree(adapter, startId) {
    const { config, records, byPartner, byChild } = adapter;
    const tree = { nodes: new Set(), edges: [], edgeKeys: new Set() };
    const maxParent = Math.max(0, Number(parentGenerations.value) || 0);
    const maxChild = Math.max(0, Number(childGenerations.value) || 0);
    const maxOther = Math.max(0, Number(otherGenerations.value) || 0);
    const expandedParents = new Set();
    const expandedChildren = new Set();

    const addNode = id => {
      if (!id || !records.has(id)) return false;
      if (!tree.nodes.has(id)) tree.nodes.add(id);
      return true;
    };
    const addEdge = (from, to) => {
      if (!addNode(from) || !addNode(to)) return;
      const key = `${from}\u0000${to}`;
      if (tree.edgeKeys.has(key)) return;
      tree.edgeKeys.add(key);
      tree.edges.push({ from, to });
    };
    const addFamilyPartners = family => {
      for (const partnerId of family.partnerIds) {
        if (records.get(partnerId)?.type === config.individualType) addEdge(partnerId, family.id);
      }
    };

    function addDescendants(personId, depth) {
      if (depth <= 0) return;
      const visitKey = `${personId}:${depth}`;
      if (expandedChildren.has(visitKey)) return;
      expandedChildren.add(visitKey);
      for (const family of byPartner.get(personId) || []) {
        addNode(family.id);
        addFamilyPartners(family);
        for (const childId of family.childIds) {
          if (records.get(childId)?.type !== config.individualType) continue;
          addEdge(family.id, childId);
          addDescendants(childId, depth - 1);
        }
      }
    }

    function addSiblings(family, focusChildId, otherDepth) {
      for (const siblingId of family.childIds) {
        if (siblingId === focusChildId || records.get(siblingId)?.type !== config.individualType) continue;
        addEdge(family.id, siblingId);
        if (otherDepth > 1) addDescendants(siblingId, otherDepth - 1);
      }
    }

    function addAncestors(personId, depth, collateralDepth) {
      if (depth <= 0) return;
      const visitKey = `${personId}:${depth}:${collateralDepth}`;
      if (expandedParents.has(visitKey)) return;
      expandedParents.add(visitKey);
      for (const family of byChild.get(personId) || []) {
        addNode(family.id);
        addEdge(family.id, personId);
        addFamilyPartners(family);
        addSiblings(family, personId, collateralDepth);
        for (const parentId of family.partnerIds) {
          if (records.get(parentId)?.type === config.individualType) {
            addAncestors(parentId, depth - 1, Math.max(0, collateralDepth - 1));
          }
        }
      }
    }

    addNode(startId);
    const startRecord = records.get(startId);
    if (startRecord?.type === config.familyType) {
      const family = adapter.families.find(item => item.id === startId);
      if (family) {
        addFamilyPartners(family);
        for (const childId of family.childIds) {
          if (records.get(childId)?.type !== config.individualType) continue;
          addEdge(startId, childId);
          addAncestors(childId, Math.max(0, maxParent - 1), maxOther);
          addDescendants(childId, Math.max(0, maxChild - 1));
        }
      }
    } else if (startRecord?.type === config.individualType) {
      addDescendants(startId, maxChild);
      addAncestors(startId, maxParent, maxOther);
    }

    return tree;
  }

  function wrapSvgLabel(value, maxChars) {
    const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      if (!line) {
        line = word;
      } else if (`${line} ${word}`.length <= maxChars) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function firstField(map, keys) {
    for (const key of keys) {
      const value = map?.[key];
      if (Array.isArray(value)) { const found=value.map(item=>String(item??'').trim()).find(Boolean); if(found)return found; }
      else if(value!==undefined && value!==null && String(value).trim()) return String(value).trim();
    }
    return '';
  }

  function makeNodeLabel(record, adapter) {
    const title=getRecordTitle(record,adapter), map=record.map||{};
    if(record.type===adapter.config.familyType){
      // The Family title is resolved from @meta@ family_display_field.
      // Do not reconstruct partner names or inject a separator in the renderer.
      const configuredTitle=String(title||'Family').trim();
      const titleLines=[];
      if(configuredTitle.includes('&')){
        const parts=configuredTitle.split('&');
        parts.forEach((part,index)=>{
          titleLines.push(...wrapSvgLabel(part.trim(),20));
          if(index<parts.length-1)titleLines.push('&');
        });
      } else {
        titleLines.push(...wrapSvgLabel(configuredTitle,20));
      }
      const marriageDate=firstField(map,['marr_date','marriage_date']);
      const marriagePlace=firstField(map,['marr_plac','marr_place','marriage_place']);
      const divorce=firstField(map,['div_date','divorce_date','div']);
      const detailLines=[];
      if(marriageDate||marriagePlace)detailLines.push({icon:'⚭',kind:'marriage',text:[marriageDate,marriagePlace].filter(Boolean).join(', ')});
      if(divorce && !/^n$/i.test(divorce))detailLines.push({icon:'⚮',kind:'divorce',text:divorce==='Y'?'':divorce});
      return {family:true,titleLines,detailLines};
    }
    const birthDate=firstField(map,['birt_date','birth_date','birthdate']);
    const deathDate=firstField(map,['deat_date','death_date','deathdate']);
    const birthPlace=firstField(map,['birt_plac','birt_place','birth_place']);
    const deathPlace=firstField(map,['deat_plac','deat_place','death_place']);
    const burialPlace=firstField(map,['buri_plac','buri_place','burial_place','bur_place']);
    const detailLines=[];
    if(birthDate||birthPlace)detailLines.push({icon:'\uf004',kind:'birth',text:[birthDate,birthPlace].filter(Boolean).join(', ')});
    if(deathDate||deathPlace)detailLines.push({icon:'\uf4ba',kind:'death',text:[deathDate,deathPlace].filter(Boolean).join(', ')});
    if(burialPlace)detailLines.push({icon:'\uf720',kind:'burial',text:burialPlace});
    const meta=app.getMeta()||{};
    const genderField=String(meta.tree_gender_field||'').trim();
    const rawGender=genderField ? firstField(map,[genderField]) : '';
    const genderDictionary=genderField && app.getDictionary ? app.getDictionary() : {};
    const genderValues=genderDictionary[genderField]?.values || {};
    const genderLabel=rawGender
      ? String(genderValues[rawGender] || rawGender).trim().toUpperCase()
      : '';
    const genderClass=genderLabel==='M'||genderLabel==='MALE'?'male'
      : genderLabel==='F'||genderLabel==='FEMALE'?'female'
      : 'unknown';
    const genderIcon=genderClass==='male'?'♂':genderClass==='female'?'♀':'';
    return {family:false,titleLines:wrapSvgLabel(title,27).slice(0,3),detailLines,genderClass,genderIcon,imageUrl:app.getImageUrl?app.getImageUrl(record):null};
  }

  function appendSvgNodeLabel(nodeSelection,label) {
    nodeSelection.selectAll('g.label').remove();
    const group=nodeSelection.append('g').attr('class','ogf-svg-node-label').attr('pointer-events','none');
    if(label.family){
      const lh=22,dh=22,total=label.titleLines.length*lh+(label.detailLines.length?label.detailLines.length*dh+7:0);
      let y=-total/2+16;
      const title=group.append('text').attr('class','ogf-svg-family-name').attr('text-anchor','middle');
      label.titleLines.forEach(line=>{title.append('tspan').attr('x',0).attr('y',y).text(line);y+=lh;});
      if(label.detailLines.length){
        y+=3;
        const detail=group.append('text').attr('class','ogf-svg-family-detail').attr('text-anchor','middle');
        label.detailLines.forEach(item=>{
          const lines=wrapSvgLabel(item.text,20);
          lines.forEach((line,index)=>{
            const tspan=detail.append('tspan').attr('x',0).attr('y',y);
            if(index===0)tspan.append('tspan').attr('class',`ogf-tree-event-icon ogf-tree-${item.kind}-icon`).text(item.icon+' ');
            tspan.append('tspan').text(line);
            y+=dh;
          });
        });
      }
      return;
    }

    const hasPhoto=!!label.imageUrl;
    const ix=-198,iy=-48,iw=80,ih=96;
    let image=null;
    if(hasPhoto){
      const portrait=group.append('g').attr('class','ogf-svg-person-portrait');
      const displayUrl=app.getImageDisplayUrl?app.getImageDisplayUrl(label.imageUrl):label.imageUrl;
      image=portrait.append('image').attr('class','ogf-tree-person-image')
        .attr('x',ix).attr('y',iy).attr('width',iw).attr('height',ih)
        .attr('preserveAspectRatio','xMidYMid slice')
        .attr('href',displayUrl).attr('xlink:href',displayUrl);
      image.on('error',function(){
        const element=d3.select(this);
        if(displayUrl!==label.imageUrl && !element.attr('data-direct-fallback')){
          element.attr('data-direct-fallback','1').attr('href',label.imageUrl).attr('xlink:href',label.imageUrl);
          return;
        }
        element.remove();
        title.attr('text-anchor','middle');
        title.selectAll('tspan').attr('x',0);
        if(detail){detail.attr('text-anchor','middle');detail.selectAll('tspan').attr('x',0);}
      });
      if(app.configureImageRequest)app.configureImageRequest(image.node(),label.imageUrl);
    }

    const tx=hasPhoto?-104:0,anchor=hasPhoto?'start':'middle';
    const th=20,dh=20,total=label.titleLines.length*th+label.detailLines.length*dh+(label.detailLines.length?5:0);
    let y=-total/2+11;
    const title=group.append('text').attr('class','ogf-svg-person-name').attr('text-anchor',anchor);
    label.titleLines.forEach((line,index)=>{
      const tspan=title.append('tspan').attr('x',tx).attr('y',y);
      if(index===0 && label.genderIcon){
        tspan.append('tspan').attr('class',`ogf-tree-gender-symbol ogf-gender-${label.genderClass}`).text(label.genderIcon + ' ');
      }
      tspan.append('tspan').text(line);
      y+=th;
    });
    let detail=null;
    if(label.detailLines.length){
      y+=2;
      detail=group.append('text').attr('class','ogf-svg-person-detail').attr('text-anchor',anchor);
      label.detailLines.forEach(item=>{
        const lines=wrapSvgLabel(item.text,hasPhoto?38:48);
        lines.forEach((line,index)=>{
          const tspan=detail.append('tspan').attr('x',tx).attr('y',y);
          if(index===0)tspan.append('tspan').attr('class',`ogf-tree-event-icon ogf-tree-${item.kind}-icon`).text(item.icon + ' ');
          tspan.append('tspan').text(line);
          y+=dh;
        });
      });
    }
  }

  function graphConfig() {
    const rankdir = orientation.value === 'vertical' ? 'TB' : 'RL';
    return {
      rankdir,
      ranker: 'network-simplex',
      edgesep: 12,
      ranksep: 48,
      nodesep: 28,
      marginx: 28,
      marginy: 28
    };
  }

  function buildGraph(startId) {
    const adapter = buildAdapterData();
    if (!adapter.config) return { adapter, graph: null, tree: null };
    const tree = createOrderedTree(adapter, startId);
    const g = new dagreD3.graphlib.Graph({ multigraph: false, compound: false })
      .setGraph(graphConfig())
      .setDefaultEdgeLabel(() => ({}));

    // Add nodes in the exact traversal insertion order, as NodeFamily.Tree does.
    for (const id of tree.nodes) {
      const record = adapter.records.get(id);
      if (!record) continue;
      const isFamily = record.type === adapter.config.familyType;
      const label = makeNodeLabel(record, adapter);
      const nodeClass = isFamily ? 'ogf-dagre-family' : `ogf-dagre-individual ogf-gender-${label.genderClass || 'unknown'}`;
      g.setNode(id, { label:'', class:nodeClass, shape:isFamily?'circle':'rect', width:isFamily?250:420, height:isFamily?250:156, padding:0, rx:isFamily?125:9, ry:isFamily?125:9, ogfLabel:label });
    }
    for (const edge of tree.edges) {
      if (g.hasNode(edge.from) && g.hasNode(edge.to)) g.setEdge(edge.from, edge.to, { curve: d3.curveBasis });
    }
    return { adapter, graph: g, tree };
  }

  function getAncestors(g, id, result = [], visited = new Set()) {
    for (const parent of g.predecessors(id) || []) {
      if (visited.has(parent)) continue;
      visited.add(parent);
      result.push(parent);
      getAncestors(g, parent, result, visited);
    }
    return result;
  }

  function getDescendants(g, id, result = [], visited = new Set()) {
    for (const child of g.successors(id) || []) {
      if (visited.has(child)) continue;
      visited.add(child);
      result.push(child);
      getDescendants(g, child, result, visited);
    }
    return result;
  }

  function installHighlighting(g) {
    const allNodes = inner.selectAll('g.node');
    const allEdges = inner.selectAll('g.edgePath');

    function clearHighlight() {
      allNodes
        .classed('ogf-dimmed', false)
        .classed('ogf-related', false)
        .style('opacity', null);
      allEdges.classed('ogf-dimmed', false);
    }

    function highlightNode(nodeId) {
      if (!nodeId || !g.hasNode(nodeId)) return;
      const related = new Set([nodeId, ...getAncestors(g, nodeId), ...getDescendants(g, nodeId)]);

      // Apply the state to the complete Dagre node group, not just its edge.
      // Inline opacity also covers the SVG shape and the HTML label rendered
      // inside foreignObject, independently of Dagre's generated CSS classes.
      allNodes
        .classed('ogf-dimmed', id => !related.has(id) && id !== selectedId)
        .classed('ogf-related', id => related.has(id))
        .style('opacity', id => (!related.has(id) && id !== selectedId) ? 0.14 : 1);
      allEdges.classed('ogf-dimmed', edge => !related.has(edge.v) || !related.has(edge.w));
    }

    allNodes
      .on('mouseenter', function() {
        // Read the datum from the rendered node itself; this is stable across
        // D3 event callback signatures and Dagre-D3's node renderer.
        highlightNode(d3.select(this).datum());
      })
      .on('mouseleave', clearHighlight);
  }

  function applySelection() {
    inner.selectAll('g.node').classed('ogf-selected', id => id === selectedId);
  }

  function getFocusNeighborhood(startId, maxDepth = 2) {
    if (!graph || !graph.hasNode(startId)) return [];
    const visited = new Set([startId]);
    let frontier = [startId];
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const next = [];
      for (const id of frontier) {
        const adjacent = [
          ...(graph.predecessors(id) || []),
          ...(graph.successors(id) || [])
        ];
        for (const neighbor of adjacent) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            next.push(neighbor);
          }
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return [...visited];
  }

  function fitToTree() {
    if (!graph || !graph.nodeCount() || !zoomBehavior) return;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const padding = 72;

    // Fitting every configured generation can shrink labels to a few pixels.
    // Start with the selected record and its immediate family neighborhood
    // (Individual -> Family -> related Individuals). The rest of the tree
    // remains in the same layout and is reachable by pan/zoom.
    const focusIds = getFocusNeighborhood(selectedId, 2);
    const focusNodes = focusIds.map(id => graph.node(id)).filter(node =>
      node && Number.isFinite(node.x) && Number.isFinite(node.y)
    );
    if (!focusNodes.length) return;

    const minX = Math.min(...focusNodes.map(node => node.x - (node.width || 0) / 2));
    const maxX = Math.max(...focusNodes.map(node => node.x + (node.width || 0) / 2));
    const minY = Math.min(...focusNodes.map(node => node.y - (node.height || 0) / 2));
    const maxY = Math.max(...focusNodes.map(node => node.y + (node.height || 0) / 2));
    const focusWidth = Math.max(1, maxX - minX);
    const focusHeight = Math.max(1, maxY - minY);

    // Never auto-fit the complete multi-generation graph to an unreadable
    // scale. The user can zoom out manually when a wider overview is needed.
    const scale = Math.max(0.35, Math.min(1.15,
      (width - padding * 2) / focusWidth,
      (height - padding * 2) / focusHeight));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const x = width / 2 - centerX * scale;
    const y = height / 2 - centerY * scale;
    svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(scale));
  }

  function centerNode(id) {
    if (!graph || !graph.hasNode(id) || !zoomBehavior) return;
    const node = graph.node(id);
    if (!Number.isFinite(node?.x) || !Number.isFinite(node?.y)) return;

    // Keep the current Dagre layout intact. Rebuilding the graph on every
    // click changes the root, reruns the layout and makes labels appear to
    // jump between positions. Navigate by panning the existing layout instead.
    const current = d3.zoomTransform(svgElement);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const x = width / 2 - node.x * current.k;
    const y = height / 2 - node.y * current.k;
    const next = d3.zoomIdentity.translate(x, y).scale(current.k);
    svg.transition().duration(220).call(zoomBehavior.transform, next);
  }

  function selectNode(id) {
    if (!graph || !graph.hasNode(id)) return;
    selectedId = id;
    document.querySelector('main')?.classList.remove('tree-card-hidden');
    app.selectRecord(id);

    // Treat the clicked record as the new navigation root. Rebuild the ordered
    // family subgraph using the current ancestor/descendant controls so users
    // can walk through a large genealogy one person/family at a time. Keep the
    // current zoom scale, then centre the newly selected root in the viewport.
    // The Dagre layout may reposition nodes because the visible rooted subgraph
    // has changed; positions remain stable until the next navigation action.
    renderTree(false);
    centerNode(id);
  }

  function renderTree(resetZoom = true) {
    const token = ++renderToken;
    const adapter = buildAdapterData();
    if (!adapter.config) {
      inner.selectAll('*').remove();
      status.textContent = 'Configure tree_relationships in @meta@ (partner_fields and child_fields) to display the tree.';
      return;
    }

    const records = adapter.records;
    if (!selectedId || !records.has(selectedId)) {
      const current = app.getSelectedId?.();
      selectedId = records.has(current) ? current : (adapter.families[0]?.partnerIds.find(id => records.has(id)) || adapter.families[0]?.id || null);
    }
    if (!selectedId) {
      inner.selectAll('*').remove();
      status.textContent = 'No Individual or Family records are available for the configured relationship fields.';
      return;
    }

    const built = buildGraph(selectedId);
    graph = built.graph;
    if (!graph || graph.nodeCount() === 0) {
      inner.selectAll('*').remove();
      status.textContent = 'No connected records found around the selected record.';
      return;
    }

    inner.selectAll('*').remove();
    graphRenderer(inner, graph);
    inner.selectAll('g.node').each(function(id) {
      const nodeData = graph.node(id);
      appendSvgNodeLabel(d3.select(this), nodeData.ogfLabel);
    });
    inner.selectAll('g.node').on('click', function(id) {
      d3.event?.stopPropagation?.();
      selectNode(id);
    });
    inner.selectAll('g.node').each(function(id) {
      const record = records.get(id);
      const title = getRecordTitle(record, built.adapter);
      d3.select(this).append('title').text(`${record.type}: ${title}`);
      d3.select(this).attr('tabindex', 0).attr('role', 'button').attr('aria-label', `${record.type}: ${title}`)
        .on('keydown', function(key) {
          if (d3.event && (d3.event.key === 'Enter' || d3.event.key === ' ')) {
            d3.event.preventDefault();
            selectNode(key);
          }
        });
    });
    installHighlighting(graph);
    applySelection();

    if (resetZoom || !zoomBehavior) {
      zoomBehavior = d3.zoom()
        .scaleExtent([0.015, 8])
        .filter(() => !d3.event || (!d3.event.button && !d3.event.ctrlKey))
        .on('zoom', () => inner.attr('transform', d3.event.transform));
      svg.call(zoomBehavior).on('dblclick.zoom', null);
      fitToTree();
    }
    if (token !== renderToken) return;
    const familyCount = [...graph.nodes()].filter(id => records.get(id)?.type === adapter.config.familyType).length;
    const peopleCount = graph.nodeCount() - familyCount;
    status.textContent = `${peopleCount} individuals · ${familyCount} families · ${graph.edgeCount()} relationships` +
      (adapter.unresolved.length ? ` · ${adapter.unresolved.length} unresolved references` : '');
  }

  function changeOrientation() {
    renderTree(true);
  }

  function zoomBy(factor) {
    if (!zoomBehavior) return;
    const current = d3.zoomTransform(svgElement);
    svg.transition().duration(160).call(zoomBehavior.scaleTo, current.k * factor);
  }

  document.getElementById('tree-zoom-in')?.addEventListener('click', () => zoomBy(1.25));
  document.getElementById('tree-zoom-out')?.addEventListener('click', () => zoomBy(0.8));
  document.getElementById('tree-reset')?.addEventListener('click', () => fitToTree());
  orientation?.addEventListener('change', changeOrientation);
  parentGenerations?.addEventListener('change', () => renderTree(true));
  childGenerations?.addEventListener('change', () => renderTree(true));
  otherGenerations?.addEventListener('change', () => renderTree(true));

  const mainElement = document.querySelector('main');
  const treeViewButton = document.getElementById('tree-view-btn');
  const directoryPane = document.getElementById('directory-pane');

  function closeTreeView() {
    mainElement?.classList.remove('tree-mode', 'tree-card-hidden');
    document.body.classList.remove('ogf-tree-open');
    pane.hidden = true;
    if (directoryPane) directoryPane.hidden = false;
    treeViewButton?.classList.remove('active');
    treeViewButton?.setAttribute('aria-pressed', 'false');
  }

  function openTreeView() {
    mainElement?.classList.add('tree-mode');
    document.body.classList.add('ogf-tree-open');
    mainElement?.classList.remove('tree-card-hidden');
    pane.hidden = false;
    if (directoryPane) directoryPane.hidden = true;
    treeViewButton?.classList.add('active');
    treeViewButton?.setAttribute('aria-pressed', 'true');
    selectedId = app.getSelectedId?.() || null;
    // Wait for the full-window workspace to expose its final dimensions.
    requestAnimationFrame(() => renderTree(true));
  }

  treeViewButton?.addEventListener('click', () => {
    if (mainElement?.classList.contains('tree-mode')) closeTreeView();
    else openTreeView();
  });
  document.getElementById('tree-close-btn')?.addEventListener('click', closeTreeView);
  document.getElementById('tree-card-close')?.addEventListener('click', () => {
    mainElement?.classList.add('tree-card-hidden');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mainElement?.classList.contains('tree-mode')) closeTreeView();
  });

  window.addEventListener('ogf:data-updated', () => {
    if (document.querySelector('main')?.classList.contains('tree-mode')) renderTree(true);
  });
  window.addEventListener('resize', () => {
    if (document.querySelector('main')?.classList.contains('tree-mode')) fitToTree();
  });
})();
