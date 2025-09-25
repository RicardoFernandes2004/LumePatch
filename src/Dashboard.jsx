import React, { useEffect, useState, useMemo } from "react";
import { 
  Box, 
  Typography, 
  Grid, 
  Card, 
  CardContent, 
  Paper,
  Chip,
  Alert,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  MenuItem,
  TextField
} from "@mui/material";
import {
  BarChart, Bar, PieChart, Pie, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell,
  CartesianGrid
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Inventory,
  Warning,
  CalendarToday,
  FilterList,
  Refresh
} from "@mui/icons-material";

// Paleta de cores consistente
const COLORS = ["#1565c0", "#42a5f5", "#81d4fa", "#29b6f6", "#4fc3f7", 
                "#ffb300", "#ffa000", "#ff8f00", "#ef5350", "#f44336", 
                "#66bb6a", "#4caf50", "#2e7d32"];

export default function Dashboard() {
  const [stock, setStock] = useState({});
  const [detections, setDetections] = useState([]);
  const [timeRange, setTimeRange] = useState("7"); // 7, 30, 90, 365
  const [refreshKey, setRefreshKey] = useState(0);

  // Carregar dados do localStorage
  useEffect(() => {
    const loadData = () => {
      try {
        const stockData = JSON.parse(localStorage.getItem("stock")) || {};
        const detectionData = JSON.parse(localStorage.getItem("savedDetections") || "[]");
        setStock(stockData);
        setDetections(detectionData);
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      }
    };

    loadData();
    // Atualizar a cada 30 segundos para dados em tempo real
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  // Processar dados para os gráficos
  const { 
    consumptionData, 
    stockData, 
    trendData, 
    alerts, 
    statistics,
    recentDetections 
  } = useMemo(() => {
    const now = new Date();
    const timeRangeMs = parseInt(timeRange) * 24 * 60 * 60 * 1000;
    const startDate = new Date(now.getTime() - timeRangeMs);

    // Filtrar detecções pelo período selecionado
    const filteredDetections = detections.filter(detection => 
      new Date(detection.ts) >= startDate
    );

    // Calcular consumo por item
    const consumptionByItem = filteredDetections.reduce((acc, detection) => {
      const item = detection.label.toLowerCase();
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {});

    // Dados para gráfico de barras (consumo)
    const consumptionData = Object.entries(consumptionByItem)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        consumo: value,
        estoque: stock[name] || 0
      }))
      .sort((a, b) => b.consumo - a.consumo);

    // Dados para gráfico de pizza (distribuição do consumo)
    const stockData = Object.entries(stock)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        percent: (value / Object.values(stock).reduce((a, b) => a + b, 0)) * 100
      }))
      .sort((a, b) => b.value - a.value);

    // Dados para tendência temporal (consumo por dia)
    const dailyConsumption = filteredDetections.reduce((acc, detection) => {
      const date = new Date(detection.ts).toLocaleDateString();
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    const trendData = Object.entries(dailyConsumption)
      .map(([date, count]) => ({ date, consumo: count }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Alertas de estoque
    const alerts = Object.entries(stock)
      .filter(([name, quantity]) => quantity <= 5)
      .map(([name, quantity]) => ({
        item: name,
        quantity,
        severity: quantity === 0 ? "error" : "warning",
        message: quantity === 0 
          ? `${name} está esgotado` 
          : `${name} está com estoque baixo (${quantity} unidades)`
      }));

    // Estatísticas gerais
    const totalStock = Object.values(stock).reduce((a, b) => a + b, 0);
    const totalConsumption = filteredDetections.length;
    const avgDailyConsumption = trendData.length > 0 
      ? totalConsumption / trendData.length 
      : 0;

    const mostConsumed = consumptionData.length > 0 ? consumptionData[0] : null;
    const criticalItems = alerts.filter(alert => alert.severity === "error").length;

    const statistics = {
      totalStock,
      totalConsumption,
      avgDailyConsumption: Math.round(avgDailyConsumption * 100) / 100,
      mostConsumed: mostConsumed ? `${mostConsumed.name} (${mostConsumed.consumo})` : "N/A",
      criticalItems,
      periodDetections: filteredDetections.length,
      uniqueItems: Object.keys(consumptionByItem).length
    };

    // Detecções recentes (últimas 5)
    const recentDetections = detections
      .slice(0, 5)
      .map(detection => ({
        ...detection,
        date: new Date(detection.ts).toLocaleString()
      }));

    return {
      consumptionData,
      stockData,
      trendData,
      alerts,
      statistics,
      recentDetections
    };
  }, [stock, detections, timeRange]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <Paper elevation={3} sx={{ p: 2, background: 'rgba(255, 255, 255, 0.95)' }}>
          <Typography variant="subtitle2" fontWeight="bold">{label}</Typography>
          {payload.map((entry, index) => (
            <Typography key={index} variant="body2" color={entry.color}>
              {entry.name}: {entry.value}
            </Typography>
          ))}
        </Paper>
      );
    }
    return null;
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Cabeçalho e Filtros */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight="bold" color="primary">
          Dashboard Analítico
        </Typography>
        
        <Stack direction="row" spacing={2} alignItems="center">
          <Chip 
            icon={<CalendarToday />} 
            label={`Últimos ${timeRange} dias`}
            variant="outlined"
          />
          <TextField
            select
            size="small"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="7">7 dias</MenuItem>
            <MenuItem value="30">30 dias</MenuItem>
            <MenuItem value="90">90 dias</MenuItem>
            <MenuItem value="365">1 ano</MenuItem>
          </TextField>
          <IconButton onClick={() => setRefreshKey(prev => prev + 1)} color="primary">
            <Refresh />
          </IconButton>
        </Stack>
      </Box>

      {/* Alertas Críticos */}
      {alerts.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Alert severity="warning" sx={{ mb: 1 }}>
            <strong>{alerts.length} alerta(s) de estoque</strong>
          </Alert>
          <Grid container spacing={1}>
            {alerts.map((alert, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Alert severity={alert.severity} variant="outlined">
                  {alert.message}
                </Alert>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Cards de Estatísticas */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #1565c0 0%, #42a5f5 100%)',
            color: 'white',
            height: '100%'
          }}>
            <CardContent>
              <Inventory sx={{ fontSize: 40, mb: 1 }} />
              <Typography variant="h4" fontWeight="bold">
                {statistics.totalStock}
              </Typography>
              <Typography variant="body2">Total em Estoque</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #2e7d32 0%, #4caf50 100%)',
            color: 'white',
            height: '100%'
          }}>
            <CardContent>
              <TrendingUp sx={{ fontSize: 40, mb: 1 }} />
              <Typography variant="h4" fontWeight="bold">
                {statistics.totalConsumption}
              </Typography>
              <Typography variant="body2">Consumo no Período</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #ffa000 0%, #ffb300 100%)',
            color: 'white',
            height: '100%'
          }}>
            <CardContent>
              <TrendingUp sx={{ fontSize: 40, mb: 1 }} />

              <Typography variant="h4" fontWeight="bold">
                {statistics.avgDailyConsumption}
              </Typography>
              <Typography variant="body2">Média Diária</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #d32f2f 0%, #f44336 100%)',
            color: 'white',
            height: '100%'
          }}>
            <CardContent>
              <Warning sx={{ fontSize: 40, mb: 1 }} />
              <Typography variant="h4" fontWeight="bold">
                {statistics.criticalItems}
              </Typography>
              <Typography variant="body2">Itens Críticos</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Gráficos Principais */}
      <Grid container spacing={4}>
        {/* Consumo por Item */}
        <Grid item xs={12} md={8}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <FilterList sx={{ mr: 1 }} />
              Consumo por Item (Últimos {timeRange} dias)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={consumptionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="consumo" name="Consumo" fill="#1565c0">
                  {consumptionData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
                <Bar dataKey="estoque" name="Estoque Atual" fill="#42a5f5">
                  {consumptionData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[(index + 5) % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Distribuição do Estoque */}
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom>
              Distribuição do Estoque
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stockData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                >
                  {stockData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Tendência Temporal */}
        <Grid item xs={12}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom>
              Tendência de Consumo Diário
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="consumo" 
                  stroke="#1565c0" 
                  fill="rgba(21, 101, 192, 0.2)" 
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="consumo" 
                  stroke="#1565c0" 
                  strokeWidth={2}
                  dot={{ fill: '#1565c0', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Detecções Recentes e Estatísticas Detalhadas */}
      <Grid container spacing={4} sx={{ mt: 1 }}>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom>
              Detecções Recentes
            </Typography>
            <List>
              {recentDetections.length > 0 ? (
                recentDetections.map((detection, index) => (
                  <ListItem key={index} divider>
                    <ListItemIcon>
                      <Chip 
                        label={`${(detection.score * 100).toFixed(1)}%`} 
                        size="small" 
                        color="primary"
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography fontWeight="bold" textTransform="capitalize">
                          {detection.label}
                        </Typography>
                      }
                      secondary={detection.date}
                    />
                  </ListItem>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  Nenhuma detecção recente
                </Typography>
              )}
            </List>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom>
              Estatísticas Detalhadas
            </Typography>
            <Stack spacing={2}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Itens únicos consumidos
                </Typography>
                <Typography variant="h6" fontWeight="bold">
                  {statistics.uniqueItems} itens
                </Typography>
              </Box>
              
              <Divider />
              
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Item mais consumido
                </Typography>
                <Typography variant="h6" fontWeight="bold">
                  {statistics.mostConsumed}
                </Typography>
              </Box>
              
              <Divider />
              
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Detecções no período
                </Typography>
                <Typography variant="h6" fontWeight="bold">
                  {statistics.periodDetections} registros
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}