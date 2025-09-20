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
  Box
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import InventoryIcon from "@mui/icons-material/Inventory";

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
  },
  shape: { borderRadius: 12 },
});

export default function App() {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const modelRef = useRef(null);
  const loopRef = useRef(false);

  const [loadingText, setLoadingText] = useState("Inicializando câmera...");
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("savedDetections") || "[]");
    } catch {
      return [];
    }
  });

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
      setLoadingText("Rodando detecção...");
      loopRef.current = true;
      runLoop();
    } catch (err) {
      console.error(err);
      setLoadingText("Erro ao inicializar.");
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
    setLoadingText("Modelo carregado");
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
        const top = preds.reduce(
          (best, cur) => (cur.probability > (best.probability || 0) ? cur : best),
          {}
        );

        const label = top.className || "";
        const prob = top.probability || 0;

        if (label) {
          ctx.font = "18px sans-serif";
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillText(`${label} ${(prob * 100).toFixed(1)}%`, 10, 30);
        }

        if (
          prob > TEACHABLE_PROB_THRESHOLD &&
          TARGET_LABELS.includes(label.toLowerCase()) &&
          !modalOpen
        ) {
          const snapshot = takeSnapshot();
          setPending({ label, score: prob, image: snapshot });
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
    if (!pending) return;
    const label = pending.label.toLowerCase();

    if (stock[label] && stock[label] > 0) {
      // dá baixa
      const updatedStock = { ...stock, [label]: stock[label] - 1 };
      setStock(updatedStock);
      localStorage.setItem("stock", JSON.stringify(updatedStock));

      const item = {
        label: pending.label,
        score: pending.score,
        image: pending.image,
        ts: new Date().toISOString(),
      };
      const next = [item, ...saved];
      setSaved(next);
      localStorage.setItem("savedDetections", JSON.stringify(next));
      setSnackbar({ open: true, message: `Baixa no estoque de ${label}`, type: "success" });
    } else {
      setSnackbar({ open: true, message: `Sem estoque de ${label}`, type: "error" });
    }

    setPending(null);
    setModalOpen(false);
  }

  function cancelPending() {
    setPending(null);
    setModalOpen(false);
  }

  function clearSaved() {
    setSaved([]);
    localStorage.removeItem("savedDetections");
  }

  function addStock() {
    const qty = parseInt(stockQty, 10);
    if (!qty || qty <= 0) return;
    const updatedStock = { ...stock, [stockItem]: (stock[stockItem] || 0) + qty };
    setStock(updatedStock);
    localStorage.setItem("stock", JSON.stringify(updatedStock));
    setSnackbar({ open: true, message: `Adicionado ${qty} ao estoque de ${stockItem}`, type: "success" });
    setStockQty(0);
    setStockModalOpen(false);
  }

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ m: 0, width: '98vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <CssBaseline />
        <AppBar color="primary" sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Toolbar sx={{ gap: 10 }}>
            <Typography variant="h6" >
              Detector de Objetos Hospitalares
            </Typography>
            <Button
              color="inherit"
              startIcon={<InventoryIcon />}
              onClick={() => setStockModalOpen(true)}
            >
              Gerenciar Estoque
            </Button>
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ mt: 4, mb: 4, width: '90vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            {loadingText} — Alvos: {TARGET_LABELS.join(", ")}
          </Typography>

          <Box sx={{ width: "90%", maxWidth: "90%", mt: 2, mb:1 }}>


            <Box
              sx={{
                display: "flex",
                overflowX: "auto",   
                gap: 2,
                py: 1,
                px: 1,
                "&::-webkit-scrollbar": {
                  height: 6,
                },
                "&::-webkit-scrollbar-thumb": {
                  backgroundColor: "#b4b4b4ff",
                  borderRadius: 3,
                },
                border: "1px solid #e0e0e0",
                borderRadius: 2,
                borderEndEndRadius:0,
                borderEndStartRadius:0,
                bgcolor: "background.paper",
              }}
            >
              {Object.entries(stock).map(([key, value]) => (
                <Card
                  key={key}
                  sx={{
                    flex: "0 0 auto",
                    minWidth: 100,
                    height: 60,
                    bgcolor: "primary.50",
                    borderColor: "primary.200",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
                    pt:1

                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: "primary.main", mb: 0.5 }}
                  >
                    {key}
                  </Typography>
                  <Box
                    sx={{
                      width: 36,
                      height: 20,
                      borderRadius: 2,
                      bgcolor: "primary.main",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: "bold",
                      m: 0
                    }}
                  >
                    {value}
                  </Box>
                  <Typography variant="caption" color="text.secondary" mt={0.1}>
                    unidades
                  </Typography>
                </Card>
              ))}
            </Box>
          </Box>

          <Stack direction={{ xs: "column", md: "row" }} spacing={3} >
            {/* Câmera */}
            <Card sx={{ width: '50%' }}>
              <CardContent sx={{ p: 0 }}>
                <video ref={videoRef} style={{ width: "100%", borderRadius: 12 }} playsInline muted />
                <canvas ref={overlayRef} style={{ inset: 0, pointerEvents: "none" }} />
              </CardContent>
            </Card>

            {/* Lista de detecções */}
            <Card sx={{ width: '50%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Detecções salvas
                </Typography>
                {saved.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Nenhuma detecção salva ainda.
                  </Typography>
                )}
                <List sx={{ maxHeight: 360, overflow: "auto" }}>
                  {saved.map((s, i) => (
                    <ListItem key={i}>
                      <ListItemAvatar>
                        <Avatar variant="rounded" src={s.image} alt={s.label} sx={{ width: 56, height: 40 }} />
                      </ListItemAvatar>
                      <ListItemText
                        primary={s.label}
                        secondary={`${new Date(s.ts).toLocaleString()} — ${(s.score * 100).toFixed(1)}%`}
                      />
                    </ListItem>
                  ))}
                </List>

                <Stack direction="row" spacing={2} mt={2}>
                  <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={clearSaved}>
                    Limpar salvos
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
                  >
                    Exportar JSON
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Container>

        {/* Canvas escondido */}
        <canvas ref={captureCanvasRef} style={{ display: "none" }} />

        {/* Modal de confirmação */}
        <Dialog open={modalOpen} onClose={cancelPending} maxWidth="sm" fullWidth>
          <DialogTitle>Confirma o objeto detectado?</DialogTitle>
          <DialogContent>
            {pending && (
              <>
                <Typography variant="body1" gutterBottom>
                  Rótulo: <strong>{pending.label}</strong> — confiança {(pending.score * 100).toFixed(1)}%
                </Typography>
                <img src={pending.image} alt="snapshot" style={{ width: "100%", borderRadius: 8, marginTop: 8 }} />
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={cancelPending} variant="outlined">
              Cancelar
            </Button>
            <Button onClick={confirmPending} variant="contained" color="primary">
              Confirmar e salvar
            </Button>
          </DialogActions>
        </Dialog>

        {/* Modal de estoque */}
        <Dialog open={stockModalOpen} onClose={() => setStockModalOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Gerenciar Estoque</DialogTitle>
          <DialogContent>
            <TextField
              select
              label="Item"
              value={stockItem}
              onChange={(e) => setStockItem(e.target.value)}
              fullWidth
              margin="normal"
            >
              {TARGET_LABELS.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
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
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStockModalOpen(false)}>Cancelar</Button>
            <Button onClick={addStock} variant="contained" color="primary">
              Adicionar
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar de feedback */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={3000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          <Alert severity={snackbar.type} sx={{ width: "100%" }}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}
