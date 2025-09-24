import React, { useEffect, useState } from "react";
import { Box, Typography, Grid, Card, CardContent } from "@mui/material";
import {
  BarChart, Bar, PieChart, Pie, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell
} from "recharts";

// Paleta de cores para diferenciar itens
const COLORS = ["#1565c0", "#42a5f5", "#81d4fa", "#ffb300", "#ef5350"];

export default function Dashboard() {
  const [stock, setStock] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("stock")) || {
        soro: 5,
        mascara: 5,
        seringa: 5,
        luvas: 10,
        alcool: 8,
        termometro: 3,
        gazes: 12,
      };
    } catch {
      return { soro: 5, mascara: 5, seringa: 5 };
    }
  });

  // Transformar dados para os gráficos
  const data = Object.entries(stock).map(([key, value]) => ({
    name: key,
    value,
  }));

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Dashboard de Consumo do Estoque
      </Typography>

      {/* Resumo em cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ bgcolor: "#1565c0", color: "white" }}>
            <CardContent>
              <Typography variant="h6">Total de Itens</Typography>
              <Typography variant="h4">{total}</Typography>
            </CardContent>
          </Card>
        </Grid>
        {data.map((item, index) => (
          <Grid item xs={12} sm={6} md={4} key={item.name}>
            <Card sx={{ bgcolor: COLORS[index % COLORS.length], color: "white" }}>
              <CardContent>
                <Typography variant="h6">{item.name}</Typography>
                <Typography variant="h4">{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Gráficos */}
      <Grid container spacing={4}>
        {/* Gráfico de barras */}
        <Grid item xs={12} md={6}>
          <Typography variant="h6" gutterBottom>
            Consumo por Item (Barras)
          </Typography>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#1565c0">
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Grid>

        {/* Gráfico de pizza */}
        <Grid item xs={12} md={6}>
          <Typography variant="h6" gutterBottom>
            Distribuição dos Itens (Pizza)
          </Typography>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(1)}%`
                }
              >
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Grid>

        {/* Gráfico de linha */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            Histórico de Consumo (Linha)
          </Typography>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#42a5f5"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </Grid>
      </Grid>
     
    </Box>
  );
}
