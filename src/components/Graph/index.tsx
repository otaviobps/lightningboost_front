import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ForceGraph, { ForceGraphMethods } from "react-force-graph-3d";
import { Button, Typography, makeStyles } from "@material-ui/core";
import { NodeInfo } from "../NodeInfo";
import {
  IProps,
  INode,
  IOptionsProps,
  IAdjacencyList,
  IGraphFunc,
  INodesFunc,
  IGraph,
  IEdgesFunc,
} from "./interfaces";

const adjacencyList: IAdjacencyList = {};

const leanLightningGraph = (graph: IGraph) => {
  const nodes: INodesFunc[] = graph.nodes.map((node) => {
    adjacencyList[node.publicKey] = [];
    return {
      publicKey: node.publicKey,
      alias: node.alias || node.publicKey,
      color: node.color === "#000000" ? "#808080" : node.color,
      visible: false,
    };
  });

  const links: IEdgesFunc[] = graph.links.map((edge) => {
    const node1 = edge.policies[0].public_key;
    const node2 = edge.policies[1].public_key;
    const { id: channelId, capacity } = edge;
    const color = ["red", "white", "blue", "green"][
      Math.round(Math.random() * 3)
    ];
    const edgeNode = {
      channelId,
      node1,
      node2,
      capacity,
      color,
    };
    adjacencyList[node1].push(edgeNode);
    adjacencyList[node2].push(edgeNode);
    return edgeNode;
  });

  return { nodes, links };
};

// add property visible to nodes with min number of channels
const showNodes = (nodes: INodesFunc[], edges: number) =>
  nodes.map((node) => ({
    ...node,
    visible: adjacencyList[node.publicKey].length >= edges,
  }));

const useStyles = makeStyles({
  buttons: {
    margin: "5px 0",
  },
  loaderContainer: {
    display: "flex",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    display: "flex",
    flexDirection: "column",
    position: "absolute",
    bottom: "10%",
    left: 15,
  },
  options: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    position: "absolute",
    top: 5,
    right: 20,
  },
  text: {
    color: "#fff",
  },
});

const Options: React.FC<IOptionsProps> = ({ graphRef }) => {
  const classes = useStyles();

  return (
    <div className={classes.options}>
      <Button color="secondary" onClick={() => graphRef.current?.zoomToFit()}>
        Reset zoom
      </Button>
    </div>
  );
};

export const Graph: React.FC<IProps> = ({ data }) => {
  const classes = useStyles();
  const [hoverNode, setHoverNode] = useState<INode | null>(null);
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const graphRef = useRef<ForceGraphMethods>();

  // minimum amount of channels to show on graph
  const [minEdges, setMinEdges] = useState(30);

  // graph state
  const [prunedTree, setPrunedTree] = useState<IGraphFunc | undefined>();

  const graph = useMemo(() => {
    const { nodes, links } = leanLightningGraph(data);
    const visibleNodes = showNodes(nodes, minEdges);
    return { nodes: visibleNodes, links };
  }, [minEdges]);

  // create a dic of nodes to faster access
  const nodesById = useMemo(
    () => Object.fromEntries(graph.nodes.map((node) => [node.publicKey, node])),
    [graph]
  );

  // function to return the nodes and channels
  const getPrunedTree = useCallback(() => {
    const visibleLinks: IEdgesFunc[] = [];
    const visibleNodes: INodesFunc[] = [];
    // only add nodes that should be visible
    graph.nodes.forEach((node) => {
      if (node.visible) {
        Object.assign(node, { links: adjacencyList[node.publicKey] });
        visibleNodes.push(node);
      }
    });
    // only add edges that should be visible
    graph.links.forEach((link) => {
      if (nodesById[link.node1].visible && nodesById[link.node2].visible) {
        visibleLinks.push(link);
      }
    });
    return { nodes: visibleNodes, links: visibleLinks };
  }, [nodesById, graph]);

  // update state when changing pruned tree
  useEffect(() => {
    setPrunedTree(getPrunedTree());
  }, [getPrunedTree]);

  // show node channels with smaller nodes
  const handleNodeClick = useCallback((node: INodesFunc) => {
    if (adjacencyList[node.publicKey].length <= 1) {
      nodesById[node.publicKey].visible = false;
      setPrunedTree(getPrunedTree());
      return;
    }
    adjacencyList[node.publicKey].forEach((nodeId) => {
      nodesById[nodeId.node1].visible = true;
      nodesById[nodeId.node2].visible = true;
    });
    setPrunedTree(getPrunedTree());
    // eslint-disable-next-line
  }, []);

  // show all nodes/channels or return to default
  const handleButtonClick = () => {
    if (minEdges === 0) {
      setMinEdges(30);
      return;
    }
    setMinEdges(0);
  };

  // adapt options on quantity of nodes
  const getPerformanceOptions = useCallback(() => {
    const graphSize = data.nodes.length;
    if (graphSize > 2500) {
      return {
        coolDownTicks: 0,
        resolution: 4,
      };
    }
    if (graphSize > 1000) {
      return {
        coolDownTicks: 5,
        resolution: 6,
      };
    }
    return {
      coolDownTicks: 20,
      resolution: 8,
    };
  }, [data.nodes.length]);

  // resize graph on window resize
  useEffect(() => {
    const windowResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", windowResize);

    return () => {
      window.removeEventListener("resize", windowResize);
    };
  }, []);

  // while graph is loading
  if (!prunedTree) {
    return (
      <div className={classes.loaderContainer}>
        <Typography align="center">Loading</Typography>
      </div>
    );
  }

  return (
    <>
      <ForceGraph
        ref={graphRef}
        graphData={data}
        width={size.width}
        height={size.height}
        nodeId="publicKey"
        onNodeClick={(node: any) => handleNodeClick(node)}
        onNodeHover={(node: any) => setHoverNode(node)}
        nodeResolution={getPerformanceOptions().resolution}
        onNodeDragEnd={(node) => {
          Object.assign(node, {
            fx: node.x,
            fy: node.y,
            fz: node.z,
          });
        }}
        linkSource="node1"
        linkTarget="node2"
        cooldownTicks={getPerformanceOptions().coolDownTicks}
        warmupTicks={20}
        rendererConfig={{
          powerPreference: "high-performance",
        }}
      />
      <Options graphRef={graphRef} />
      {hoverNode && graphRef.current && (
        <NodeInfo
          graph2ScreenCoords={graphRef.current.graph2ScreenCoords}
          info={hoverNode}
        />
      )}
    </>
  );
};
