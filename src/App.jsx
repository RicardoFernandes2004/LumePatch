import React, { useRef, useEffect, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as tmImage from "@teachablemachine/image";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Stack,
  CssBaseline,
  TextField,
  MenuItem,
  Snackbar,
  Alert,
  Box,
  Grid,
  Paper,
  Chip,
  IconButton,
  Tabs,
  Tab,
  Divider,
  Tooltip,
  Fab
} from "@mui/material";
import { ThemeProvider, createTheme, alpha } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import InventoryIcon from "@mui/icons-material/Inventory";
import AddIcon from "@mui/icons-material/Add";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import HistoryIcon from "@mui/icons-material/History";
import WarningIcon from "@mui/icons-material/Warning";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import Dashboard from "./Dashboard";

const TEACHABLE_MODEL_URL = "/teachable/";
const TARGET_LABELS = [
  "soro",
  "mascara",
  "seringa",
  "luvas",
  "alcool",
  "termometro",
  "avental",
  "agulha",
  "tubo de ensaio",
  "pipeta",
  "centrifuga",
  "microscopio",
  "ataduras",
];
const TEACHABLE_PROB_THRESHOLD = 0.85;

const theme = createTheme({
  palette: {
    primary: { main: "#1565c0" },
    secondary: { main: "#42a5f5" },
    background: {
      default: "#f8fafc",
      paper: "#ffffff",
    },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: "'Inter', 'Roboto', sans-serif",
    h4: {
      fontWeight: 700,
    },
    h6: {
      fontWeight: 600,
    },
  },
});

// Componente para exibir o nível de estoque com cores
const StockLevelIndicator = ({ quantity, lowStockThreshold = 10 }) => {
  const getColor = () => {
    if (quantity === 0) return "error";
    if (quantity <= lowStockThreshold) return "warning";
    return "success";
  };

  const getIcon = () => {
    if (quantity === 0) return <WarningIcon />;
    if (quantity <= lowStockThreshold) return <WarningIcon />;
    return <CheckCircleIcon />;
  };

  return (
    <Chip
      icon={getIcon()}
      label={`${quantity} un`}
      color={getColor()}
      variant={quantity === 0 ? "filled" : "outlined"}
      size="small"
      sx={{ fontWeight: 600 }}
    />
  );
};

// Componente de card de estoque personalizado
const StockCard = ({ itemName, quantity, onAddStock }) => {
  const isLowStock = quantity <= 10;
  const isOutOfStock = quantity === 0;

  return (
    <Card
      sx={{
        height: 120,
        background: isOutOfStock
          ? `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.1)} 0%, ${alpha(theme.palette.error.main, 0.05)} 100%)`
          : isLowStock
            ? `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.1)} 0%, ${alpha(theme.palette.warning.main, 0.05)} 100%)`
            : `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.1)} 0%, ${alpha(theme.palette.success.main, 0.05)} 100%)`,
        border: `2px solid ${isOutOfStock
          ? alpha(theme.palette.error.main, 0.3)
          : isLowStock
            ? alpha(theme.palette.warning.main, 0.3)
            : alpha(theme.palette.success.main, 0.3)
          }`,
        transition: "all 0.3s ease",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: 4,
        },
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        p: 2,
      }}
    >
      <Box>
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 600,
            color: isOutOfStock ? "error.main" : "text.primary",
            textTransform: "capitalize",
            mb: 1
          }}
        >
          {itemName.replace(/_/g, " ")}
        </Typography>
        <StockLevelIndicator quantity={quantity} />
      </Box>
      <Tooltip title={`Adicionar estoque para ${itemName}`}>
        <IconButton
          size="small"
          onClick={() => onAddStock(itemName)}
          sx={{
            alignSelf: "flex-end",
            bgcolor: "primary.main",
            color: "white",
            "&:hover": { bgcolor: "primary.dark" }
          }}
        >
          <AddIcon />
        </IconButton>
      </Tooltip>
    </Card>
  );
};

function TabPanel({ children, value, index, ...other }) {
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function App() {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const modelRef = useRef(null);
  const loopRef = useRef(false);

  const [loadingText, setLoadingText] = useState("Inicializando câmera...");
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState([]);
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("savedDetections") || "[]");
    } catch {
      return [];
    }
  });

  // NOVO: quantidade a confirmar (opcional)
  const [confirmQty, setConfirmQty] = useState("");

  // Estado do estoque
  const [stock, setStock] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("stock")) || {
        soro: 20,
        mascara: 50,
        seringa: 100,
        luvas: 200,
        alcool: 30,
        termometro: 15,
        avental: 40,
        agulha: 120,
        tubo_ensaio: 300,
        pipeta: 80,
        centrifuga: 5,
        microscopio: 3,
        ataduras: 60,
      };
    } catch {
      return {
        soro: 20,
        mascara: 50,
        seringa: 100,
        luvas: 200,
        alcool: 30,
        termometro: 15,
        avental: 40,
        agulha: 120,
        tubo_ensaio: 300,
        pipeta: 80,
        centrifuga: 5,
        microscopio: 3,
        ataduras: 60,
      };
    }
  });

  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockItem, setStockItem] = useState("soro");
  const [stockQty, setStockQty] = useState(0);
  const [activeTab, setActiveTab] = useState(0);

  const [snackbar, setSnackbar] = useState({ open: false, message: "", type: "success" });



  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    try {
      await setupCamera();
      setLoadingText("Carregando modelo...");
      await loadModel();
      setLoadingText("Detecção ativa - Aponte a câmera para os objetos");
      loopRef.current = true;
      runLoop();
    } catch (err) {
      console.error(err);
      setLoadingText("Erro ao inicializar a câmera.");
    }
  }

  function stop() {
    loopRef.current = false;
    const stream = videoRef.current && videoRef.current.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }

  async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const video = videoRef.current;
    video.srcObject = stream;
    await video.play();
    const overlay = overlayRef.current;
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    const cap = captureCanvasRef.current;
    cap.width = video.videoWidth;
    cap.height = video.videoHeight;
  }

  async function loadModel() {
    modelRef.current = await tmImage.load(
      TEACHABLE_MODEL_URL + "model.json",
      TEACHABLE_MODEL_URL + "metadata.json"
    );
  }

  async function runLoop() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const ctx = overlay.getContext("2d");

    async function frame() {
      if (!loopRef.current) return;
      ctx.clearRect(0, 0, overlay.width, overlay.height);

      try {
        const preds = await modelRef.current.predict(video);

        // filtra todas acima do threshold
        const ignoredClasses = ["none / outros", "none", "outros"];

        const detected = preds.filter(
          p =>
            p.probability > TEACHABLE_PROB_THRESHOLD &&
            !ignoredClasses.includes(p.className.toLowerCase())
        );

        console.log("detected", detected);


        if (detected.length > 0 && !modalOpen) {
          const snapshot = takeSnapshot();
          setPending(
            detected.map(d => ({
              label: d.className,
              score: d.probability,
              image: snapshot,
            }))
          );
          setModalOpen(true);
        }

      } catch (e) {
        console.error(e);
      }

      setTimeout(() => {
        if (loopRef.current) requestAnimationFrame(frame);
      }, 500);
    }
    frame();
  }

  function takeSnapshot() {
    const video = videoRef.current;
    const cap = captureCanvasRef.current;
    const ctx = cap.getContext("2d");
    ctx.drawImage(video, 0, 0, cap.width, cap.height);
    return cap.toDataURL("image/png");
  }
  function confirmPending() {
    if (!pending || pending.length === 0) return;

    // Fechar modal independente do resultado
    const closeModal = () => {
      setPending([]);
      setModalOpen(false);
      setConfirmQty("");
    };

    let updatedStock = { ...stock };
    let newSaved = [...saved];
    let messages = [];

    pending.forEach((det) => {
      const label = det.label.toLowerCase().replace(/ /g, "_"); // normalizar nomes
      let qty = parseInt(confirmQty, 10);
      if (isNaN(qty) || qty <= 0) qty = 1;

      if (updatedStock[label] && updatedStock[label] >= qty) {
        updatedStock[label] -= qty;

        newSaved.unshift({
          label: det.label,
          score: det.score,
          image: det.image,
          ts: new Date().toISOString(),
          quantity: qty,
        });

        messages.push(`✅ ${qty} unidade(s) baixadas de ${label}`);
      } else if (updatedStock[label] && updatedStock[label] < qty) {
        messages.push(`❌ ${label}: quantidade solicitada maior que o estoque disponível`);
      } else {
        messages.push(`❌ Sem estoque de ${label}`);
      }
    });

    // atualizar estados e localStorage
    setStock(updatedStock);
    localStorage.setItem("stock", JSON.stringify(updatedStock));

    setSaved(newSaved);
    localStorage.setItem("savedDetections", JSON.stringify(newSaved));

    setSnackbar({ open: true, message: messages.join("\n"), type: "info" });

    closeModal();
  }

  function cancelPending() {
    setPending(null);
    setModalOpen(false);
    setConfirmQty("");
  }

  function clearSaved() {
    setSaved([]);
    localStorage.removeItem("savedDetections");
    setSnackbar({ open: true, message: "Histórico de detecções limpo", type: "info" });
  }

  function addStock() {
    const qty = parseInt(stockQty, 10);
    if (!qty || qty <= 0) return;
    const updatedStock = { ...stock, [stockItem]: (stock[stockItem] || 0) + qty };
    setStock(updatedStock);
    localStorage.setItem("stock", JSON.stringify(updatedStock));
    setSnackbar({ open: true, message: `📦 Adicionado ${qty} unidades ao estoque de ${stockItem}`, type: "success" });
    setStockQty(0);
    setStockModalOpen(false);
  }

  const handleAddStockClick = (item) => {
    setStockItem(item);
    setStockQty(10); // Valor padrão
    setStockModalOpen(true);
  };

  // Calcular estatísticas do estoque
  const lowStockItems = Object.entries(stock).filter(([_, qty]) => qty <= 10);
  const outOfStockItems = Object.entries(stock).filter(([_, qty]) => qty === 0);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      {/* Header */}
      <AppBar
        position="static"
        elevation={2}
        sx={{
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          mb: 4,
          width: '98vw'
        }}
      >
        <Toolbar>
          <CameraAltIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 600 }}>
            Sistema de Controle Hospitalar
          </Typography>

          <Stack direction="row" spacing={2}>
            <Button
              color="inherit"
              startIcon={<InventoryIcon />}
              onClick={() => setActiveTab(1)}
              sx={{
                borderRadius: 2,
                px: 3,
                "&:hover": { backgroundColor: alpha("#fff", 0.1) }
              }}
            >
              Estoque
            </Button>
            <Button
              color="inherit"
              startIcon={<AnalyticsIcon />}
              onClick={() => setActiveTab(2)}
              sx={{
                borderRadius: 2,
                px: 3,
                "&:hover": { backgroundColor: alpha("#fff", 0.1) }
              }}
            >
              Dashboard
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mb: 8 }}>
        {/* Indicadores de status */}
        <Grid container spacing={3} sx={{
          mb: 4, display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              elevation={2}
              sx={{
                p: 3,
                textAlign: "center",
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`

              }}
            >
              <Typography variant="h4" color="primary" fontWeight="bold">
                {Object.values(stock).reduce((a, b) => a + b, 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total em Estoque
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3} >
            <Paper
              elevation={2}
              sx={{
                p: 3,
                textAlign: "center",
                background: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.1)} 0%, ${alpha(theme.palette.warning.main, 0.05)} 100%)`,
                border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`
              }}
            >
              <Typography variant="h4" color="warning.main" fontWeight="bold">
                {lowStockItems.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Itens com Baixo Estoque
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              elevation={2}
              sx={{
                p: 3,
                textAlign: "center",
                background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.1)} 0%, ${alpha(theme.palette.error.main, 0.05)} 100%)`,
                border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`
              }}
            >
              <Typography variant="h4" color="error.main" fontWeight="bold">
                {outOfStockItems.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Itens Esgotados
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              elevation={2}
              sx={{
                p: 3,
                textAlign: "center",
                background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.1)} 0%, ${alpha(theme.palette.success.main, 0.05)} 100%)`,
                border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`
              }}
            >
              <Typography variant="h4" color="success.main" fontWeight="bold">
                {saved.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Detecções Realizadas
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* Abas principais */}
        <Paper elevation={2} sx={{ borderRadius: 3, overflow: "hidden" }}>
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
            variant="fullWidth"
            sx={{
              background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)} 0%, ${alpha(theme.palette.background.default, 0.9)} 100%)`,
              "& .MuiTab-root": { fontWeight: 600, py: 2 },

            }}
          >
            <Tab icon={<CameraAltIcon />} label="Detecção em Tempo Real" />
            <Tab icon={<InventoryIcon />} label="Gestão de Estoque" />
            <Tab icon={<AnalyticsIcon />} label="Dashboard Analítico" />
          </Tabs>

          <Divider />

          {/* Tab 1: Detecção em Tempo Real */}
          <TabPanel value={activeTab} index={0}>
            <Grid container spacing={4} sx={{ width: '100%', margin: 0 }}>
              <Grid item xs={12} lg={8} sx={{ width: '50%' }}>
                <Card elevation={3} sx={{ borderRadius: 3, overflow: "hidden", width: "100%" }}>
                  <CardContent sx={{ p: 0, position: "relative" }}>
                    <Box sx={{ position: "relative" }}>
                      <video
                        ref={videoRef}
                        style={{
                          width: "100%",
                          height: "400px",
                          objectFit: "cover",
                          display: "block"
                        }}
                        playsInline
                        muted
                      />
                      <canvas
                        ref={overlayRef}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          pointerEvents: "none",
                        }}
                      />
                      <Box
                        sx={{
                          position: "absolute",
                          top: 16,
                          left: 16,
                          bgcolor: alpha("#000", 0.7),
                          color: "white",
                          px: 2,
                          py: 1,
                          borderRadius: 2,
                          backdropFilter: "blur(10px)"
                        }}
                      >
                        <Typography variant="body2">
                          {loadingText}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} lg={8} sx={{ width: '47%' }} >
                <Card elevation={3} sx={{ borderRadius: 3, height: "100%" }}>
                  <CardContent>
                    <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
                      <HistoryIcon color="primary" sx={{ mr: 1 }} />
                      <Typography variant="h6" fontWeight="bold">
                        Histórico de Detecções
                      </Typography>
                    </Box>

                    {saved.length === 0 ? (
                      <Box sx={{ textAlign: "center", py: 4 }}>
                        <CameraAltIcon sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
                        <Typography variant="body2" color="text.secondary">
                          Nenhuma detecção realizada ainda.
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Aponte a câmera para os objetos hospitalares
                        </Typography>
                      </Box>
                    ) : (
                      <List sx={{ maxHeight: 320, overflow: "auto" }}>
                        {saved.map((s, i) => (
                          <ListItem key={i} divider>
                            <ListItemAvatar>
                              <Avatar
                                variant="rounded"
                                src={s.image}
                                alt={s.label}
                                sx={{ width: 60, height: 45 }}
                              />
                            </ListItemAvatar>
                            <ListItemText
                              primary={
                                <Typography fontWeight="600" textTransform="capitalize">
                                  {s.label}
                                </Typography>
                              }
                              secondary={
                                <Box>
                                  <Typography variant="body2" color="text.secondary">
                                    {new Date(s.ts).toLocaleString()}
                                  </Typography>
                                  <Chip
                                    label={`${(s.score * 100).toFixed(1)}%`}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                  />
                                </Box>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    )}

                    <Stack direction="row" spacing={2} mt={3}>
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={clearSaved}
                        fullWidth
                      >
                        Limpar Histórico
                      </Button>
                      <Button
                        variant="contained"
                        color="primary"
                        startIcon={<SaveAltIcon />}
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "detections.json";
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        fullWidth
                      >
                        Exportar
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Tab 2: Gestão de Estoque */}
          <TabPanel value={activeTab} index={1}>
            <Box sx={{ mb: 4 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                <Typography variant="h5" fontWeight="bold">
                  Gestão de Estoque
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setStockModalOpen(true)}
                  sx={{ borderRadius: 2 }}
                >
                  Adicionar Estoque
                </Button>
              </Box>

              {/* Alertas de estoque */}
              {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
                <Box sx={{ mb: 3 }}>
                  {outOfStockItems.length > 0 && (
                    <Alert severity="error" sx={{ mb: 1, borderRadius: 2 }}>
                      <strong>{outOfStockItems.length} item(s) esgotado(s):</strong> {outOfStockItems.map(([name]) => name).join(", ")}
                    </Alert>
                  )}
                  {lowStockItems.length > 0 && (
                    <Alert severity="warning" sx={{ borderRadius: 2 }}>
                      <strong>{lowStockItems.length} item(s) com estoque baixo:</strong> {lowStockItems.map(([name]) => name).join(", ")}
                    </Alert>
                  )}
                </Box>
              )}

              {/* Grid de estoque */}
              <Grid container spacing={2}>
                {Object.entries(stock).map(([itemName, quantity]) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={itemName}>
                    <StockCard
                      itemName={itemName}
                      quantity={quantity}
                      onAddStock={handleAddStockClick}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          </TabPanel>

          {/* Tab 3: Dashboard Analítico */}
          <TabPanel value={activeTab} index={2}>
            <Dashboard />
          </TabPanel>
        </Paper>
      </Container>

      {/* Canvas escondido */}
      <canvas ref={captureCanvasRef} style={{ display: "none" }} />

      {/* Modal de confirmação */}
      <Dialog
        open={modalOpen}
        onClose={cancelPending}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{
          bgcolor: "primary.main",
          color: "white",
          fontWeight: 600
        }}>
          <CheckCircleIcon sx={{ mr: 1, verticalAlign: "middle" }} />
          Objeto Detectado
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {pending && pending.length > 0 && (
            <>
              {pending.map((p, i) => (
                <Box sx={{display:'flex', flexDirection:'column', alignItems:'center',justifyContent:'center'}}>
                  <Box sx={{ textAlign: "center", m: 2 }}>
                    <Chip
                      label={`${(p.score * 100).toFixed(1)}% de confiança`}
                      color="primary"
                      sx={{ mb: 2 }}
                    />
                    <Typography variant="h6" gutterBottom>
                      Confirmar detecção de <strong style={{ textTransform: "capitalize" }}>{p.label}</strong>?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Esta ação registrará uma baixa no estoque automaticamente.
                    </Typography>
                    {/* NOVO: campo para quantidade opcional */}
                    <TextField
                      label="Quantidade (opcional)"
                      type="number"
                      value={confirmQty}
                      onChange={(e) => setConfirmQty(e.target.value)}
                      fullWidth
                      inputProps={{ min: 1 }}
                      helperText="Se deixar em branco, será descontado 1 unidade."
                      sx={{ mt: 1 }}
                    />
                  </Box>
                  <img
                    src={p.image}
                    alt="snapshot"
                    style={{
                      width: "auto",
                      maxHeight: '40vh',
                      borderRadius: 12,
                      margin:'0 auto',
                      border: `2px solid ${theme.palette.primary.main}`
                    }}
                  />
                </Box>
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button
            onClick={cancelPending}
            variant="outlined"
            sx={{ borderRadius: 2 }}
          >
            Cancelar
          </Button>
          <Button
            onClick={confirmPending}
            variant="contained"
            color="primary"
            sx={{ borderRadius: 2 }}
          >
            Confirmar Baixa
          </Button>
        </DialogActions>
      </Dialog>


      {/* Modal de estoque */}
      <Dialog
        open={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          <AddIcon sx={{ mr: 1, verticalAlign: "middle" }} />
          Adicionar ao Estoque
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <TextField
            select
            label="Item"
            value={stockItem}
            onChange={(e) => setStockItem(e.target.value)}
            fullWidth
            margin="normal"
            variant="outlined"
          >
            {TARGET_LABELS.map((item) => (
              <MenuItem key={item} value={item}>
                <Box sx={{ textTransform: "capitalize" }}>{item.replace(/_/g, " ")}</Box>
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Quantidade"
            type="number"
            value={stockQty}
            onChange={(e) => setStockQty(e.target.value)}
            fullWidth
            margin="normal"
            variant="outlined"
            InputProps={{ inputProps: { min: 1 } }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Estoque atual: <strong>{stock[stockItem] || 0} unidades</strong>
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={() => setStockModalOpen(false)}
            sx={{ borderRadius: 2 }}
          >
            Cancelar
          </Button>
          <Button
            onClick={addStock}
            variant="contained"
            color="primary"
            sx={{ borderRadius: 2 }}
          >
            Adicionar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar de feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          severity={snackbar.type}
          sx={{
            borderRadius: 2,
            fontWeight: 500
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Botão flutuante para voltar ao topo */}
      <Fab
        color="primary"
        aria-label="voltar ao topo"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
        }}
      >
        <AddIcon sx={{ transform: "rotate(45deg)" }} />
      </Fab>
    </ThemeProvider>
  );
}
