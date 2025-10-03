// App.jsx (ou .tsx) - versão atualizada com FEFO, upload .zip, correção e login simples
import React, { useRef, useEffect, useState } from "react";
import * as tmImage from "@teachablemachine/image";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Box,
  Container,
  Grid,
  Paper,
  Button,
  Stack,
  Card,
  CardContent,
  Chip,
  IconButton,
  Tooltip,
  MenuItem,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Snackbar,
  Alert,
  Fab,
  Input,
} from "@mui/material";
import {
  CameraAlt as CameraAltIcon,
  Inventory as InventoryIcon,
  Analytics as AnalyticsIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  SaveAlt as SaveAltIcon,
  CheckCircle as CheckCircleIcon,
  History as HistoryIcon,
  Login as LoginIcon,
  UploadFile as UploadFileIcon,
  Edit as EditIcon,
} from "@mui/icons-material";

// (Assumo que você já tem Dashboard component)
import Dashboard from "./Dashboard";

const TEACHABLE_MODEL_URL = "/teachable/";
const TARGET_LABELS = [
  "soro_fisiológico_0,9%",
  "mascara",
  "caixa_de_máscara_10_unidades",
  "luva_latex_m_10_unidades",
  "seringa",
  "luvas",
  "alcool",
  "termometro",
  "avental",
  "agulha",
  "tubo_ensaio",
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
    h4: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
});

// Helper: get timestamp ISO
const nowISO = () => new Date().toISOString();

// UTIL: migrate old simple stock (label -> qty) to lots structure
function migrateStock(oldStockSimple) {
  const stockLots = {};
  Object.entries(oldStockSimple).forEach(([label, qty]) => {
    stockLots[label] = [
      {
        lotId: `initial_${Date.now()}`,
        qty: Number(qty || 0),
        ts: new Date().toISOString(),
      },
    ];
  });
  return stockLots;
}

// UTIL: sum lots to total qty
function totalQty(lots = []) {
  return lots.reduce((s, l) => s + (Number(l.qty) || 0), 0);
}

// UTIL: consume FEFO from lots, returns {success: boolean, consumedLots: [{lotId, qtyConsumed}], updatedLots}
function consumeFEFO(lots = [], desiredQty) {
  let remaining = desiredQty;
  const sorted = [...lots].sort((a, b) => new Date(a.ts) - new Date(b.ts)); // oldest first
  const consumed = [];
  const updated = sorted.map((l) => ({ ...l }));
  for (let i = 0; i < updated.length && remaining > 0; i++) {
    const available = Number(updated[i].qty || 0);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    updated[i].qty = available - take;
    consumed.push({ lotId: updated[i].lotId, qty: take, ts: updated[i].ts });
    remaining -= take;
  }
  if (remaining > 0) {
    return { success: false, consumedLots: [], updatedLots: lots };
  }
  // filter zero qty lots
  const cleaned = updated.filter((l) => Number(l.qty) > 0);
  return { success: true, consumedLots: consumed, updatedLots: cleaned };
}

export default function App() {
  // video & model refs
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const modelRef = useRef(null);
  const loopRef = useRef(false);

  // UI state
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

  const [confirmQty, setConfirmQty] = useState("");
  // stock now by-lots: { label: [ {lotId, qty, ts}, ... ] }
  const [stockLots, setStockLots] = useState(() => {
    try {
      const v = localStorage.getItem("stockLots");
      if (v) return JSON.parse(v);
      // if there's old "stock" simple, migrate
      const old = localStorage.getItem("stock");
      if (old) {
        try {
          const o = JSON.parse(old);
          const migrated = migrateStock(o);
          localStorage.setItem("stockLots", JSON.stringify(migrated));
          return migrated;
        } catch {
          return {};
        }
      }
      // default initial (create one lot per item)
      const init = {};
      TARGET_LABELS.forEach((label) => {
        init[label] = [{ lotId: `initial_${label}`, qty: 20, ts: new Date().toISOString() }];
      });
      return init;
    } catch {
      return {};
    }
  });

  // stock modal fields (add lote)
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockLabel, setStockLabel] = useState(TARGET_LABELS[0]);
  const [stockLotId, setStockLotId] = useState("");
  const [stockLotQty, setStockLotQty] = useState(0);
  const [stockLotDate, setStockLotDate] = useState(""); // ISO date string

  const [activeTab, setActiveTab] = useState(0);

  const [snackbar, setSnackbar] = useState({ open: false, message: "", type: "success" });



  // zip uploads (metadata saved)
  const [zipUploads, setZipUploads] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("zipUploads") || "[]");
    } catch {
      return [];
    }
  });

  // correction dialog
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionIndex, setCorrectionIndex] = useState(null);
  const [correctionLabel, setCorrectionLabel] = useState("");
  const [correctionQty, setCorrectionQty] = useState(1);

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
        const ignoredClasses = ["none / outros", "none", "outros"];
        const detected = preds.filter(
          p =>
            p.probability > TEACHABLE_PROB_THRESHOLD &&
            !ignoredClasses.includes(p.className.toLowerCase())
        );
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

  // Confirm pending detections: FEFO consumption
  function confirmPending() {
    if (!pending || pending.length === 0) return;

    const closeModal = () => {
      setPending([]);
      setModalOpen(false);
      setConfirmQty("");
    };

    let updatedLots = { ...stockLots };
    const newSaved = [...saved];
    const messages = [];

    pending.forEach((det) => {
      const normalized = det.label.toLowerCase().replace(/ /g, "_");
      let qty = parseInt(confirmQty, 10);
      if (isNaN(qty) || qty <= 0) qty = 1;

      const lotsForLabel = updatedLots[normalized] || [];
      const totalAvailable = totalQty(lotsForLabel);

      if (totalAvailable >= qty) {
        // consume FEFO
        const { success, consumedLots, updatedLots: newLots } = consumeFEFO(lotsForLabel, qty);
        if (!success) {
          messages.push(`❌ ${normalized}: erro ao consumir lotes`);
        } else {
          updatedLots[normalized] = newLots;
          const savedEntry = {
            label: det.label,
            score: det.score,
            image: det.image,
            ts: new Date().toISOString(),
            quantity: qty,
            consumedLots, // informação de quais lotes foram consumidos
            user: username || "unknown",
          };
          newSaved.unshift(savedEntry);
          messages.push(`✅ ${qty} unidade(s) baixadas de ${normalized}`);
        }
      } else {
        messages.push(`❌ ${normalized}: estoque insuficiente (${totalAvailable} dispon.)`);
      }
    });

    setStockLots(updatedLots);
    localStorage.setItem("stockLots", JSON.stringify(updatedLots));

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

  // Add a lot
  function addLot() {
    const qty = parseInt(stockLotQty, 10);
    if (!qty || qty <= 0) {
      setSnackbar({ open: true, message: "Quantidade inválida", type: "error" });
      return;
    }
    const lotId = stockLotId && stockLotId.trim() !== "" ? stockLotId.trim() : `lot_${Date.now()}`;
    const ts = stockLotDate ? new Date(stockLotDate).toISOString() : new Date().toISOString();

    const updated = { ...stockLots };
    if (!updated[stockLabel]) updated[stockLabel] = [];
    updated[stockLabel] = [{ lotId, qty, ts }, ...updated[stockLabel]];
    setStockLots(updated);
    localStorage.setItem("stockLots", JSON.stringify(updated));
    setSnackbar({ open: true, message: `📦 Lote ${lotId} adicionado em ${stockLabel}`, type: "success" });
    // reset
    setStockLotQty(0);
    setStockLotId("");
    setStockLotDate("");
    setStockModalOpen(false);
  }

  // Export saved to file
  function exportSaved() {
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "detections.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ZIP upload handler (converts to base64 if < limit)
  const ZIP_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB
  function handleZipUpload(file) {
    if (!file) return;
    if (file.size > ZIP_SIZE_LIMIT) {
      setSnackbar({
        open: true,
        message: "Arquivo muito grande para salvar localmente (>5MB). Envie para um backend.",
        type: "warning",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      const base64 = e.target.result;
      const meta = {
        name: file.name,
        size: file.size,
        ts: new Date().toISOString(),
        data: base64,
      };
      const updated = [meta, ...zipUploads];
      setZipUploads(updated);
      localStorage.setItem("zipUploads", JSON.stringify(updated));
      setSnackbar({ open: true, message: `📥 ${file.name} carregado para treino`, type: "success" });
    };
    reader.readAsDataURL(file);
  }

  // Login handling


  function doLogout() {
    set("");
    localStorage.removeItem("username");
    setSnackbar({ open: true, message: "Logout realizado", type: "info" });
  }

  // Correction flow: open correction for an existing saved detection
  function openCorrection(i) {
    const entry = saved[i];
    if (!entry) return;
    setCorrectionIndex(i);
    setCorrectionLabel(entry.label);
    setCorrectionQty(entry.quantity || 1);
    setCorrectionOpen(true);
  }
  function applyCorrection() {
    if (correctionIndex === null) return;
    const index = correctionIndex;
    const previous = saved[index];
    const oldQty = previous.quantity || 0;
    const newQty = parseInt(correctionQty, 10) || 0;
    const newLabel = correctionLabel;
    const updatedSaved = [...saved];

    // If label changed or qty increased, we need to adjust stock/backstock accordingly.
    // Simple approach:
    // - If newQty < oldQty: we should add back (reponha) the difference into a new "correction" lot with ts=now.
    // - If newQty > oldQty: try to consume FEFO from stock for the difference; if not enough, notify user.
    // - If label changed: we treat it as if previous detection removed old item; we'll revert oldQty to old label, and then apply newQty to new label.
    (async () => {
      const updatedLots = { ...stockLots };

      // revert old removal: add back oldQty to old label as a correction lot
      const oldLabelNorm = (previous.label || "").toLowerCase().replace(/ /g, "_");
      if (!updatedLots[oldLabelNorm]) updatedLots[oldLabelNorm] = [];
      updatedLots[oldLabelNorm] = [
        {
          lotId: `correction_restock_${Date.now()}`,
          qty: oldQty,
          ts: new Date().toISOString(),
        },
        ...updatedLots[oldLabelNorm],
      ];

      // now try to consume newQty from newLabel
      const newLabelNorm = (newLabel || "").toLowerCase().replace(/ /g, "_");
      if (!updatedLots[newLabelNorm]) updatedLots[newLabelNorm] = [];

      // attempt to consume newQty
      const { success, consumedLots, updatedLots: newUpdatedForLabel } = consumeFEFO(
        updatedLots[newLabelNorm],
        newQty
      );

      if (!success) {
        setSnackbar({
          open: true,
          message: `Não há estoque suficiente para aplicar a correção (label ${newLabel})`,
          type: "error",
        });
        // revert the revert? we already added restock — ok leave it as reponha, but inform user
      } else {
        updatedLots[newLabelNorm] = newUpdatedForLabel;
        // update saved entry
        updatedSaved[index] = {
          ...previous,
          label: newLabel,
          quantity: newQty,
          correctedBy: currentUser || "unknown",
          correctedAt: new Date().toISOString(),
          consumedLots, // new consumption
        };
        setSaved(updatedSaved);
        localStorage.setItem("savedDetections", JSON.stringify(updatedSaved));
        setStockLots(updatedLots);
        localStorage.setItem("stockLots", JSON.stringify(updatedLots));
        setSnackbar({ open: true, message: "Correção aplicada", type: "success" });
      }
    })();

    setCorrectionOpen(false);
    setCorrectionIndex(null);
  }

  // UI helpers: totals, low stock etc.
  const allLabels = TARGET_LABELS;
  const totals = {};
  allLabels.forEach((label) => {
    totals[label] = totalQty(stockLots[label] || []);
  });
  const lowStockItems = Object.entries(totals).filter(([_, qty]) => qty <= 10);
  const outOfStockItems = Object.entries(totals).filter(([_, qty]) => qty === 0);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Função de login simples (mock)
  const handleLogin = () => {
    if (username) {
      setIsLoggedIn(true);
    } else {
      alert("Usuário ou senha incorretos!");
    }
  };


  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
     

       <Dialog
        open={!isLoggedIn}
        disableEscapeKeyDown
        PaperProps={{
          sx: {
            borderRadius: 4,
            p: 3,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            minWidth: 380,
            bgcolor: "background.paper",
          },
        }}
      >
        <DialogTitle
          sx={{
            textAlign: "center",
            fontWeight: 700,
            fontSize: "1.5rem",
            color: "primary.main",
            mb: 2,
          }}
        >
          Bem vindo de volta!
          Faça seu login:
        </DialogTitle>

        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            autoFocus
            margin="dense"
            label="Usuário"
            fullWidth
            variant="outlined"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />
          <TextField
            margin="dense"
            label="Senha"
            type="password"
            fullWidth
            variant="outlined"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />
        </DialogContent>

        <DialogActions sx={{ justifyContent: "center", mt: 1 }}>
          <Button
            onClick={handleLogin}
            variant="contained"
            color="primary"
            sx={{
              borderRadius: 3,
              px: 4,
              py: 1,
              fontWeight: 600,
              textTransform: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              ":hover": {
                boxShadow: "0 6px 16px rgba(0,0,0,0.15)",
              },
            }}
          >
            Entrar
          </Button>
        </DialogActions>
      </Dialog>

      <AppBar position="static" elevation={2} sx={{ background: theme.palette.primary.main, mb: 4 }}>
        <Toolbar>
          <CameraAltIcon sx={{ mr: 2 }} />
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            LumePath - DASA
          </Typography>

          <Stack direction="row" spacing={1}>
            {username ? (
              <>
                <Typography variant="body2" sx={{ alignSelf: "center", mr: 1 }}>{username}</Typography>
                <Button color="inherit" onClick={doLogout} startIcon={<LoginIcon />}>
                  Logout
                </Button>
              </>
            ) : (
              <Button color="inherit" onClick={!isLoggedIn} startIcon={<LoginIcon />}>
                Login
              </Button>
            )}

            <Button color="inherit" startIcon={<InventoryIcon />} onClick={() => setActiveTab(1)}>
              Estoque
            </Button>
            <Button color="inherit" startIcon={<AnalyticsIcon />} onClick={() => setActiveTab(2)}>
              Dashboard
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mb: 8,display:'flex', flexDirection:'column', alignItems:'center'}}>
        {/* indicadores */}
        <Grid container spacing={3} sx={{ mb: 4,}}>
          <Grid item xs={12} sm={6} md={3} sx={{}}>
            <Paper elevation={2} sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="h4" color="primary" fontWeight="bold">
                {Object.values(totals).reduce((a, b) => a + b, 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">Total em Estoque</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper elevation={2} sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="h4" color="warning.main" fontWeight="bold">
                {lowStockItems.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">Itens com Baixo Estoque</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper elevation={2} sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="h4" color="error.main" fontWeight="bold">
                {outOfStockItems.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">Itens Esgotados</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper elevation={2} sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="h4" color="success.main" fontWeight="bold">
                {saved.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">Detecções Realizadas</Typography>
            </Paper>
          </Grid>
        </Grid>

        <Paper elevation={2} sx={{ borderRadius: 3, overflow: "hidden" }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="fullWidth">
            <Tab icon={<CameraAltIcon />} label="Detecção em Tempo Real" />
            <Tab icon={<InventoryIcon />} label="Gestão de Estoque" />
            <Tab icon={<AnalyticsIcon />} label="Dashboard Analítico" />
          </Tabs>
          <Divider />

          {/* Tab 0: Detecção */}
          <Box hidden={activeTab !== 0} sx={{ p: 3,}}>
            <Grid container spacing={4} sx={{display:'flex', alignItems:'center', justifyContent:'center'}}>
              <Grid item xs={12} lg={8} sx={{width:'40vw', height:'100%'}}>
                <Card>
                  <CardContent sx={{ p: 0, position: "relative" }}>
                    <Box sx={{ position: "relative" }}>
                      <video ref={videoRef} style={{ width: "100%", height: 400, objectFit: "cover" }} playsInline muted />
                      <canvas ref={overlayRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
                      <Box sx={{ position: "absolute", top: 16, left: 16, bgcolor: "rgba(0,0,0,0.6)", color: "white", px: 2, py: 1, borderRadius: 2 }}>
                        <Typography variant="body2">{loadingText}</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} lg={4}>
                <Card sx={{width:'40vw'}}>
                  <CardContent>
                    <Box display="flex" alignItems="center" mb={2}>
                      <HistoryIcon color="primary" sx={{ mr: 1 }} />
                      <Typography variant="h6">Histórico de Detecções</Typography>
                    </Box>

                    {saved.length === 0 ? (
                      <Box textAlign="center" py={4}>
                        <CameraAltIcon sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
                        <Typography variant="body2" color="text.secondary">Nenhuma detecção realizada ainda.</Typography>
                      </Box>
                    ) : (
                      <List sx={{ maxHeight: 320, overflow: "auto" }}>
                        {saved.map((s, i) => (
                          <ListItem key={i} divider secondaryAction={
                            <Stack direction="row" spacing={1}>
                              <Tooltip title="Corrigir detecção">
                                <IconButton edge="end" onClick={() => openCorrection(i)}><EditIcon /></IconButton>
                              </Tooltip>
                            </Stack>
                          }>
                            <ListItemAvatar>
                              <Avatar variant="rounded" src={s.image} alt={s.label} sx={{ width: 60, height: 45 }} />
                            </ListItemAvatar>
                            <ListItemText
                              primary={<Typography fontWeight={600} textTransform="capitalize">{s.label}</Typography>}
                              secondary={
                                <Box>
                                  <Typography variant="body2" color="text.secondary">{new Date(s.ts).toLocaleString()} — {s.user || "—"}</Typography>
                                  <Chip label={`${(s.score * 100).toFixed(1)}%`} size="small" sx={{ mt: 0.5 }} />
                                  <Typography variant="caption" display="block">Qtd: {s.quantity}</Typography>
                                </Box>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    )}

                    <Stack direction="row" spacing={2} mt={2}>
                      <Button variant="outlined" color="error" startIcon={<DeleteIcon />} fullWidth onClick={clearSaved}>Limpar Histórico</Button>
                      <Button variant="contained" color="primary" startIcon={<SaveAltIcon />} fullWidth onClick={exportSaved}>Exportar</Button>
                    </Stack>
                  </CardContent>
                </Card>


              </Grid>



              {/* Upload zip */}
              <Card
                sx={{
                  mt: 3,
                  borderRadius: 4,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                  p: 2,
                }}
              >
                <CardContent>
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    sx={{ color: "primary.main", mb: 0.5 }}
                  >
                    Upload de Treinamento
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2 }}
                  >
                    Envie uma pasta <b>.zip</b> com imagens para treinos futuros (salvo localmente, limite 5MB).
                  </Typography>

                  {/* Área de upload parecida com a da imagem */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      p: 2,
                      border: "2px dashed #ccc",
                      borderRadius: 3,
                      justifyContent: "space-between",
                      bgcolor: "#fafafa",
                    }}
                  >
                    <Button
                      variant="contained"
                      component="label"
                      sx={{
                        borderRadius: 3,
                        px: 3,
                        py: 1,
                        textTransform: "none",
                        fontWeight: 600,
                      }}
                    >
                      Selecionar ZIP
                      <input
                        type="file"
                        hidden
                        accept=".zip"
                        onChange={(e) => {
                          const f = e.target.files && e.target.files[0];
                          handleZipUpload(f);
                          e.target.value = null;
                        }}
                      />
                    </Button>

                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary", flex: 1, textAlign: "center" }}
                    >
                      {zipUploads.length > 0
                        ? `${zipUploads.length} arquivo(s) anexado(s)`
                        : "Nenhum arquivo selecionado"}
                    </Typography>
                  </Box>

                  {/* Lista de uploads */}
                  {zipUploads.length > 0 && (
                    <Box mt={2}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mb: 1, display: "block" }}
                      >
                        Últimos uploads:
                      </Typography>
                      <List dense>
                        {zipUploads.map((z, idx) => (
                          <ListItem
                            key={idx}
                            sx={{
                              border: "1px solid #eee",
                              borderRadius: 2,
                              mb: 1,
                              px: 2,
                            }}
                          >
                            <ListItemText
                              primary={z.name}
                              secondary={new Date(z.ts).toLocaleString()}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}
                </CardContent>
              </Card>


            </Grid>
          </Box>

          {/* Tab 1: Estoque (Lotes) */}
          <Box hidden={activeTab !== 1} sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Typography variant="h5" fontWeight="bold">Gestão de Estoque por Lotes (FEFO)</Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setStockModalOpen(true)}>Adicionar Lote</Button>
            </Box>

            {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
              <Box mb={3}>
                {outOfStockItems.length > 0 && (<Alert severity="error" sx={{ mb: 1 }}>{outOfStockItems.length} item(s) esgotado(s): {outOfStockItems.map(([n]) => n).join(", ")}</Alert>)}
                {lowStockItems.length > 0 && (<Alert severity="warning">{lowStockItems.length} item(s) com estoque baixo: {lowStockItems.map(([n]) => n).join(", ")}</Alert>)}
              </Box>
            )}

            <Grid container spacing={2}>
              {allLabels.map((label) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={label} >
                  {(stockLots[label] || []).slice(0, 4).map((l, idx) => (
                    <Card sx={{
                      p: 2, backgroundColor: l.qty > 10 ? '#f2fcf0ff' : '#fdf1f1ff', display: 'flex', flexDirection: 'column', alignItems: 'center'
                    }}>
                      <Box display="flex" justifyContent="space-between" alignItems="center" flexDirection={"column"} mb={1}>
                        <Button size="small" variant="contained" sx={{ mb: 2, backgroundColor: '#378dffff' }} onClick={() => {
                          setStockLabel(label);
                          setStockLotQty(10);
                          setStockLotId("");
                          setStockLotDate("");
                          setStockModalOpen(true);

                        }}>+ Adicionar Lote</Button>
                        <Typography fontWeight={700} textTransform="capitalize">{label.replace(/_/g, " ")}</Typography>
                      </Box>
                      <Typography variant="h6" sx={{ mb: 1 }}>{totals[label]} </Typography>
                      <Typography variant="body2" sx={{ mb: 1 }}>Unidades</Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                        <List dense>
                          <ListItem key={l.lotId + idx} >
                            <ListItemText primary={`Lote: ${l.lotId} — ${l.qty} un`} secondary={new Date(l.ts).toLocaleString()} />
                          </ListItem>
                          {((stockLots[label] || []).length > 4) && <ListItem><ListItemText primary={`+ ${(stockLots[label] || []).length - 4} lotes`} /></ListItem>}
                        </List>
                      </Box>
                    </Card>
                  ))}
                </Grid>
              ))}
            </Grid>
          </Box>

          {/* Tab 2: Dashboard */}
          <Box hidden={activeTab !== 2} sx={{ p: 3 }}>
            <Dashboard />
          </Box>
        </Paper>
      </Container>

      {/* Hidden canvas */}
      <canvas ref={captureCanvasRef} style={{ display: "none" }} />

      {/* Modal confirmação de detecção */}
      <Dialog open={modalOpen} onClose={cancelPending} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: "primary.main", color: "white", fontWeight: 600 }}>
          <CheckCircleIcon sx={{ mr: 1 }} /> Objeto Detectado
        </DialogTitle>
        <DialogContent dividers>
          {pending && pending.length > 0 && pending.map((p, i) => (
            <Box key={i} textAlign="center" mb={2}>
              <Chip label={`${(p.score * 100).toFixed(1)}% de confiança`} color="primary" sx={{ mb: 1 }} />
              <Typography variant="h6">Confirmar detecção de <strong style={{ textTransform: "capitalize" }}>{p.label}</strong>?</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Esta ação registrará uma baixa no estoque (FEFO)</Typography>
              <TextField
                label="Quantidade (opcional)"
                type="number"
                value={confirmQty}
                onChange={(e) => setConfirmQty(e.target.value)}
                fullWidth
                inputProps={{ min: 1 }}
                helperText="Se deixar vazio, desconta 1 unidade"
                sx={{ my: 1 }}
              />
              <img src={p.image} alt="snapshot" style={{ maxHeight: "40vh", borderRadius: 12, border: `2px solid ${theme.palette.primary.main}` }} />
            </Box>
          ))}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={cancelPending} variant="outlined">Cancelar</Button>
          <Button onClick={confirmPending} variant="contained" color="primary">Confirmar Baixa</Button>
        </DialogActions>
      </Dialog>

      {/* Modal adicionar lote */}
      <Dialog open={stockModalOpen} onClose={() => setStockModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Adicionar Lote</DialogTitle>
        <DialogContent>
          <TextField select label="Item" value={stockLabel} onChange={(e) => setStockLabel(e.target.value)} fullWidth margin="normal">
            {TARGET_LABELS.map((t) => <MenuItem key={t} value={t}>{t.replace(/_/g, " ")}</MenuItem>)}
          </TextField>
          <TextField label="ID do Lote (opcional)" value={stockLotId} onChange={(e) => setStockLotId(e.target.value)} fullWidth margin="normal" />
          <TextField label="Quantidade" type="number" value={stockLotQty} onChange={(e) => setStockLotQty(e.target.value)} fullWidth margin="normal" inputProps={{ min: 1 }} />
          <TextField type="datetime-local" label="Data de Entrada (opcional)" value={stockLotDate} onChange={(e) => setStockLotDate(e.target.value)} fullWidth margin="normal" InputLabelProps={{ shrink: true }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStockModalOpen(false)}>Cancelar</Button>
          <Button onClick={addLot} variant="contained">Adicionar Lote</Button>
        </DialogActions>
      </Dialog>



      {/* Correction modal */}
      <Dialog open={correctionOpen} onClose={() => setCorrectionOpen(false)}>
        <DialogTitle>Corrigir Detecção</DialogTitle>
        <DialogContent>
          <TextField label="Label" fullWidth value={correctionLabel} onChange={(e) => setCorrectionLabel(e.target.value)} margin="normal" />
          <TextField label="Quantidade" type="number" fullWidth value={correctionQty} onChange={(e) => setCorrectionQty(e.target.value)} margin="normal" inputProps={{ min: 0 }} />
          <Typography variant="caption" color="text.secondary">Se aumentar a quantidade, o sistema tentará consumir do estoque; se diminuir, irá repor via um lote de correção.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCorrectionOpen(false)}>Cancelar</Button>
          <Button onClick={applyCorrection} variant="contained">Aplicar</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert severity={snackbar.type} sx={{ borderRadius: 2 }}>{snackbar.message}</Alert>
      </Snackbar>

      {/* Floating action: voltar topo */}
      <Fab color="primary" aria-label="voltar" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} sx={{ position: "fixed", bottom: 24, right: 24 }}>
        <AddIcon sx={{ transform: "rotate(45deg)" }} />
      </Fab>
    </ThemeProvider>
  );
}
